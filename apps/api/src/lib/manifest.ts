import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { parse as parseYaml } from 'yaml'
import type { RepoRef } from './providers'
import { logger } from './logger'
import { getManifestConfig } from './manifest-config'

const log = logger.child({ module: 'manifest' })

/**
 * .tabularium manifest schema.
 * Plugin authors drop a `.tabularium` (YAML) or `.tabularium.json` file at the root of their repo.
 * Re-fetched on every release webhook and persisted to the plugin row.
 */
export const ManifestSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  description: Type.Optional(Type.String({ maxLength: 280 })),
  category: Type.Optional(Type.String({ maxLength: 40 })),
  kind: Type.Optional(Type.String({ minLength: 1, maxLength: 40, pattern: '^[a-z0-9][a-z0-9-]*$' })),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 30 }), { maxItems: 16 })),
  license: Type.Optional(Type.String({ maxLength: 40 })),
  icon: Type.Optional(Type.String({ maxLength: 500 })),
  screenshots: Type.Optional(Type.Array(Type.Object({
    url: Type.String({ minLength: 1, maxLength: 500 }),
    caption: Type.Optional(Type.String({ maxLength: 200 })),
    alt: Type.Optional(Type.String({ maxLength: 200 })),
  }), { maxItems: 12 })),
  readme: Type.Optional(Type.String({ maxLength: 500 })), // relative path; resolved separately
  documentation_url: Type.Optional(Type.String({ pattern: '^https?://.+' })),
  homepage: Type.Optional(Type.String({ pattern: '^https?://.+' })),
  support: Type.Optional(Type.Object({
    email: Type.Optional(Type.String({ maxLength: 254 })),
    issues_url: Type.Optional(Type.String({ pattern: '^https?://.+' })),
  })),
  min_runtime_version: Type.Optional(Type.String({ maxLength: 40 })),
})

export type Manifest = Static<typeof ManifestSchema>

const MAX_BYTES = 64 * 1024
const MAX_README_BYTES = 200 * 1024

export type ResolvedManifest = {
  raw: string
  parsed: Manifest
  readmeMarkdown: string | null
  source: 'tabularium.yaml' | 'tabularium.json'
}

export function parseManifestText(text: string, source: ResolvedManifest['source']): Manifest {
  let json: unknown
  if (source === 'tabularium.json') {
    json = JSON.parse(text)
  } else {
    json = parseYaml(text)
  }
  if (!json || typeof json !== 'object') throw new Error('Manifest root must be an object')
  const errors = [...Value.Errors(ManifestSchema, json)]
  if (errors.length > 0) {
    const summary = errors.slice(0, 5).map((e) => `${e.path}: ${e.message}`).join('; ')
    throw new Error(`Invalid manifest: ${summary}`)
  }
  return Value.Clean(ManifestSchema, json) as Manifest
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
    return makeGithubFlavoredFetcher(`${instance.baseUrl}/api/v1`, accessToken, ref, branch, null)
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
  return `${instance.baseUrl}/${owner}/${repo}/raw/branch/${branch}/`
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
      if (parsed.readme) {
        try {
          const readme = await fetch(parsed.readme)
          if (readme) readmeMarkdown = readme.content
        } catch (err) {
          log.warn({ err, readme: parsed.readme }, 'readme path fetch failed — manifest still applied')
        }
      } else {
        for (const fallback of ['README.md', 'readme.md', 'README.markdown']) {
          try {
            const readme = await fetch(fallback)
            if (readme) {
              readmeMarkdown = readme.content
              break
            }
          } catch {
            // try next
          }
        }
      }
      return { raw: got.content, parsed, readmeMarkdown, source: candidate.source }
    } catch (err) {
      log.warn({ err, path: candidate.path }, 'manifest parse failed — trying next candidate')
    }
  }
  return null
}
