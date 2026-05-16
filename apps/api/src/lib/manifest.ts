import { Value } from '@sinclair/typebox/value'
import { ValueErrorType } from '@sinclair/typebox/errors'
import { parse as parseYaml } from 'yaml'
import type { RepoRef } from './providers'
import { logger } from './logger'
import { getManifestConfig } from './manifest-config'
import { ManifestSchema, type Manifest, type ResolvedManifest, type ReadmeMap } from './manifest-core'
import { buildValidatorSchema } from './manifest-schema'
import type { ValidationError } from '@tabularium/manifest'

const log = logger.child({ module: 'manifest' })

export { ManifestSchema, type Manifest, type ResolvedManifest }

const MAX_BYTES = 64 * 1024
const MAX_README_BYTES = 200 * 1024

export class ManifestValidationError extends Error {
  constructor(public errors: ValidationError[]) {
    const summary = errors.slice(0, 5).map((e) => `${e.path}: ${e.message}`).join('; ')
    super(`Invalid manifest: ${summary}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ''}`)
    this.name = 'ManifestValidationError'
  }
}

export function parseManifestText(text: string, source: ResolvedManifest['source']): Manifest {
  let json: unknown
  try {
    json = source === 'tabularium.json' ? JSON.parse(text) : parseYaml(text)
  } catch (err) {
    throw new ManifestValidationError([
      {
        path: '/',
        code: 'parse',
        message: err instanceof Error ? err.message : String(err),
      },
    ])
  }
  if (!json || typeof json !== 'object') {
    throw new ManifestValidationError([
      { path: '/', code: 'type', message: 'Manifest root must be an object' },
    ])
  }
  if ('$schema' in (json as Record<string, unknown>)) {
    delete (json as Record<string, unknown>).$schema
  }
  const declaredKind = typeof (json as Record<string, unknown>).kind === 'string'
    ? ((json as Record<string, unknown>).kind as string)
    : null
  const merged = buildValidatorSchema({ kind: declaredKind })
  const errors = [...Value.Errors(merged, json)]
  if (errors.length > 0) {
    const structured: ValidationError[] = errors.map((e) => ({
      path: e.path === '' ? '/' : e.path,
      // ValueErrorType is a numeric enum — reverse-lookup gives a readable
      // name like "ObjectRequiredProperty". Falls back to numeric string if
      // a new error type lands without a mapping.
      code: ValueErrorType[e.type] ?? String(e.type),
      message: e.message,
      // expected intentionally omitted — TypeBox errors don't carry the
      // expected-constraint value the way ajv does. The ajv-backed mapper
      // (package's mapAjvErrors) populates this; this server path does not.
      actual: typeof e.value === 'string' && e.value.length > 200 ? e.value.slice(0, 200) : e.value,
    }))
    throw new ManifestValidationError(structured)
  }
  return Value.Clean(merged, json) as Manifest
}

type FileFetcher = (path: string) => Promise<{ content: string; bytes: number } | null>

function makeGithubFlavoredFetcher(apiBase: string, accessToken: string, ref: RepoRef, branch: string | undefined, userAgent: string | null): FileFetcher {
  return async (path) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.raw',
    }
    if (userAgent) headers['User-Agent'] = userAgent
    const url = `${apiBase}/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(path)}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`
    const res = await fetch(url, { headers })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Fetch ${path}: ${res.status}`)
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_README_BYTES) throw new Error(`${path} exceeds size cap`)
    const text = await res.text()
    return { content: text, bytes: new TextEncoder().encode(text).length }
  }
}

function makeGiteaFetcher(apiBase: string, accessToken: string, ref: RepoRef, branch: string | undefined): FileFetcher {
  return async (path) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
    const url = `${apiBase}/repos/${ref.owner}/${ref.repo}/raw/${path.split('/').map(encodeURIComponent).join('/')}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`
    const res = await fetch(url, { headers })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Fetch ${path}: ${res.status}`)
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_README_BYTES) throw new Error(`${path} exceeds size cap`)
    const text = await res.text()
    return { content: text, bytes: new TextEncoder().encode(text).length }
  }
}

function makeGitlabFetcher(baseUrl: string, accessToken: string, ref: RepoRef, branch: string | undefined): FileFetcher {
  return async (path) => {
    const projectId = encodeURIComponent(ref.fullName)
    const url = `${baseUrl}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(branch ?? 'HEAD')}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Fetch ${path}: ${res.status}`)
    const text = await res.text()
    return { content: text, bytes: new TextEncoder().encode(text).length }
  }
}

function fetcherFor(accessToken: string, ref: RepoRef, branch?: string): FileFetcher {
  const { instance } = ref
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com'
      ? 'https://api.github.com'
      : `${instance.baseUrl}/api/v3`
    return makeGithubFlavoredFetcher(apiBase, accessToken, ref, branch, 'tabularium/1.0')
  }
  if (instance.kind === 'gitea') {
    return makeGiteaFetcher(`${instance.baseUrl}/api/v1`, accessToken, ref, branch)
  }
  return makeGitlabFetcher(instance.baseUrl, accessToken, ref, branch)
}

function manifestCandidates(): Array<{ path: string; source: ResolvedManifest['source'] }> {
  return getManifestConfig().candidates.map(({ path, source }) => ({
    path,
    source: source === 'json' ? 'tabularium.json' : 'tabularium.yaml',
  }))
}

export function rawContentBase(ref: RepoRef, branch: string): string {
  const { instance, owner, repo } = ref
  if (instance.kind === 'github') {
    if (instance.baseUrl === 'https://github.com') return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`
    return `${instance.baseUrl}/${owner}/${repo}/raw/${branch}/`
  }
  if (instance.kind === 'gitlab') return `${instance.baseUrl}/${ref.fullName}/-/raw/${branch}/`
  return `${instance.baseUrl}/${owner}/${repo}/raw/${branch}/`
}

export async function resolveManifest(accessToken: string, ref: RepoRef, options: { ref?: string } = {}): Promise<ResolvedManifest | null> {
  const fetch = fetcherFor(accessToken, ref, options.ref)
  for (const candidate of manifestCandidates()) {
    try {
      const got = await fetch(candidate.path)
      if (!got) continue
      if (got.bytes > MAX_BYTES) {
        log.warn({ path: candidate.path, bytes: got.bytes }, 'manifest exceeds size cap — ignored')
        continue
      }
      const parsed = parseManifestText(got.content, candidate.source)
      let readmeMarkdown: string | null = null
      let readmeLocales: ReadmeMap | null = null

      if (parsed.readmes && Object.keys(parsed.readmes).length > 0) {
        readmeLocales = {}
        for (const [locale, path] of Object.entries(parsed.readmes)) {
          try {
            const r = await fetch(path)
            if (r) readmeLocales[locale] = r.content
          } catch (err) {
            log.warn({ err, locale, path }, 'localized readme fetch failed')
          }
        }
        if (Object.keys(readmeLocales).length === 0) readmeLocales = null
      }
      if (!readmeLocales && parsed.readme) {
        try {
          const r = await fetch(parsed.readme)
          if (r) readmeMarkdown = r.content
        } catch (err) {
          log.warn({ err, readme: parsed.readme }, 'readme path fetch failed — manifest still applied')
        }
      }
      if (!readmeLocales && !readmeMarkdown) {
        for (const fallback of ['README.md', 'readme.md', 'README.markdown']) {
          try {
            const r = await fetch(fallback)
            if (r) {
              readmeMarkdown = r.content
              break
            }
          } catch {
            // try next
          }
        }
      }
      return { raw: got.content, parsed, readmeMarkdown, readmeLocales, source: candidate.source }
    } catch (err) {
      if (err instanceof ManifestValidationError) {
        log.warn({ path: candidate.path, errors: err.errors }, 'manifest invalid — trying next candidate')
      } else {
        log.warn({ err, path: candidate.path }, 'manifest fetch/parse failed — trying next candidate')
      }
    }
  }
  return null
}
