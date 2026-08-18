import type { RepoRef } from './providers'
import { logger } from './logger'
import { getManifestConfig } from './manifest-config'
import { UpstreamUnauthorizedError } from './oauth-tokens'
import {
  ManifestSchema,
  type Manifest,
  type ResolvedManifest,
  type ReadmeMap,
  parseManifest,
  validateManifest,
  ParseError,
} from '@tabularium/manifest'
import { buildMergedSchema } from './manifest-schema'
import { getKinds } from './kinds'
import { getSetting } from './settings'
import type { ValidationError } from '@tabularium/manifest'

const log = logger.child({ module: 'manifest' })

export { ManifestSchema, type Manifest, type ResolvedManifest }

const MAX_BYTES = 64 * 1024
const MAX_README_BYTES = 200 * 1024

export class ManifestValidationError extends Error {
  constructor(public errors: ValidationError[]) {
    const summary = errors
      .slice(0, 5)
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ')
    super(`Invalid manifest: ${summary}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ''}`)
    this.name = 'ManifestValidationError'
  }
}

export function parseManifestText(text: string): Manifest {
  let parsed: Record<string, unknown>
  try {
    parsed = parseManifest(text)
  } catch (err) {
    if (err instanceof ParseError) {
      throw new ManifestValidationError([{ path: '/', code: 'parse', message: err.message }])
    }
    throw err
  }
  const declaredKind = typeof parsed.kind === 'string' ? parsed.kind : null
  const schema = buildMergedSchema({ kind: declaredKind })
  const result = validateManifest(parsed, schema, { lenient: true })
  if (!result.ok) {
    throw new ManifestValidationError(result.errors)
  }
  // Optional admin-enforced policy: when at least one kind is configured and
  // the toggle is on, every submitted manifest must declare a kind that
  // matches one of the configured keys. This kicks in after schema validation
  // because `kind` is structurally optional at the schema level.
  enforceKindPolicy(result.normalized as Record<string, unknown>)
  return result.normalized as Manifest
}

function enforceKindPolicy(normalized: Record<string, unknown>): void {
  if (getSetting('manifest.require_kind') !== '1') return
  const kinds = getKinds()
  if (kinds.length === 0) return // policy needs at least one configured kind to mean anything
  const declared = typeof normalized.kind === 'string' ? normalized.kind : null
  if (!declared) {
    throw new ManifestValidationError([
      {
        path: '/kind',
        code: 'required',
        message: `manifest must declare a kind — pick one of: ${kinds.map((k) => k.key).join(', ')}`,
      },
    ])
  }
  if (!kinds.some((k) => k.key === declared)) {
    throw new ManifestValidationError([
      {
        path: '/kind',
        code: 'enum',
        message: `kind "${declared}" is not in this registry — pick one of: ${kinds.map((k) => k.key).join(', ')}`,
      },
    ])
  }
}

type FileFetcher = (path: string) => Promise<{ content: string; bytes: number } | null>

function makeGithubFlavoredFetcher(
  apiBase: string,
  accessToken: string,
  ref: RepoRef,
  branch: string | undefined,
  userAgent: string | null,
): FileFetcher {
  return async (path) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.raw',
    }
    if (userAgent) headers['User-Agent'] = userAgent
    const url = `${apiBase}/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(path)}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`
    const res = await fetch(url, { headers })
    if (res.status === 404) return null
    if (res.status === 401) throw new UpstreamUnauthorizedError(ref.instance.id, `contents/${path}`)
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
    if (res.status === 401) throw new UpstreamUnauthorizedError(ref.instance.id, `raw/${path}`)
    if (!res.ok) throw new Error(`Fetch ${path}: ${res.status}`)
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_README_BYTES) throw new Error(`${path} exceeds size cap`)
    const text = await res.text()
    return { content: text, bytes: new TextEncoder().encode(text).length }
  }
}

function makeGitlabFetcher(
  baseUrl: string,
  accessToken: string,
  ref: RepoRef,
  branch: string | undefined,
): FileFetcher {
  return async (path) => {
    const projectId = encodeURIComponent(ref.fullName)
    const url = `${baseUrl}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(branch ?? 'HEAD')}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (res.status === 404) return null
    if (res.status === 401) throw new UpstreamUnauthorizedError(ref.instance.id, `files/${path}`)
    if (!res.ok) throw new Error(`Fetch ${path}: ${res.status}`)
    const text = await res.text()
    return { content: text, bytes: new TextEncoder().encode(text).length }
  }
}

function fetcherFor(accessToken: string, ref: RepoRef, branch?: string): FileFetcher {
  const { instance } = ref
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${instance.baseUrl}/api/v3`
    return makeGithubFlavoredFetcher(apiBase, accessToken, ref, branch, 'tabularium/1.0')
  }
  if (instance.kind === 'gitea') {
    return makeGiteaFetcher(`${instance.baseUrl}/api/v1`, accessToken, ref, branch)
  }
  return makeGitlabFetcher(instance.baseUrl, accessToken, ref, branch)
}

function manifestCandidates(): Array<{ path: string }> {
  return getManifestConfig().candidates
}

export function rawContentBase(ref: RepoRef, branch: string): string {
  const { instance, owner, repo } = ref
  if (instance.kind === 'github') {
    if (instance.baseUrl === 'https://github.com')
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`
    return `${instance.baseUrl}/${owner}/${repo}/raw/${branch}/`
  }
  if (instance.kind === 'gitlab') return `${instance.baseUrl}/${ref.fullName}/-/raw/${branch}/`
  return `${instance.baseUrl}/${owner}/${repo}/raw/${branch}/`
}

export type ReleaseAsset = { name: string; url: string }

// Re-fetch the current asset list for a release tag from the forge.
// Webhooks fire on release create, but CI commonly attaches the assets a
// few seconds AFTER — by the time we hit this, the published list often
// has the manifest asset that the original webhook payload was missing.
export async function fetchReleaseAssetList(
  accessToken: string,
  ref: RepoRef,
  tag: string,
): Promise<ReleaseAsset[] | null> {
  const { instance } = ref
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'tabularium/1.0',
  }
  let url: string
  let parse: (body: unknown) => ReleaseAsset[]
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${instance.baseUrl}/api/v3`
    url = `${apiBase}/repos/${ref.owner}/${ref.repo}/releases/tags/${encodeURIComponent(tag)}`
    parse = (body) => {
      const r = body as { assets?: Array<{ name: string; browser_download_url: string }> }
      return (r.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url }))
    }
  } else if (instance.kind === 'gitea') {
    url = `${instance.baseUrl}/api/v1/repos/${ref.owner}/${ref.repo}/releases/tags/${encodeURIComponent(tag)}`
    parse = (body) => {
      const r = body as { assets?: Array<{ name: string; browser_download_url: string }> }
      return (r.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url }))
    }
  } else {
    // gitlab releases endpoint
    const projectId = encodeURIComponent(ref.fullName)
    url = `${instance.baseUrl}/api/v4/projects/${projectId}/releases/${encodeURIComponent(tag)}`
    parse = (body) => {
      const r = body as { assets?: { links?: Array<{ name: string; url: string }> } }
      return (r.assets?.links ?? []).map((a) => ({ name: a.name, url: a.url }))
    }
  }
  try {
    const res = await fetch(url, { headers })
    if (res.status === 404) return null
    if (!res.ok) {
      log.warn({ url, status: res.status }, 'release asset list fetch failed')
      return null
    }
    return parse(await res.json())
  } catch (err) {
    log.warn({ err, url }, 'release asset list fetch errored')
    return null
  }
}

async function fetchAssetContent(url: string, accessToken: string): Promise<{ content: string; bytes: number } | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'tabularium/1.0',
  }
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`fetch asset ${url}: ${res.status}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) throw new Error(`asset ${url} content-length ${len} exceeds ${MAX_BYTES}`)
  const text = await res.text()
  return { content: text, bytes: new TextEncoder().encode(text).length }
}

// Resolves the README a manifest points at: the localized `readmes` map first,
// then a single `readme` path, then the conventional root filenames. Shared by
// both manifest paths so an asset-resolved release captures the same README a
// git-ref-resolved one would.
async function resolveReadme(
  fetch: FileFetcher,
  parsed: Manifest,
): Promise<{ readmeMarkdown: string | null; readmeLocales: ReadmeMap | null }> {
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
  return { readmeMarkdown, readmeLocales }
}

// Reads the README for an already-ingested release, given the manifest that
// shipped with it. Used by the backfill: releases stored before the per-release
// README column existed still have their tag on the forge, and a tag is
// immutable, so this recovers exactly what that version shipped with.
export async function fetchReadmeAtTag(
  accessToken: string,
  ref: RepoRef,
  tag: string,
  parsed: Manifest,
): Promise<{ readmeMarkdown: string | null; readmeLocales: ReadmeMap | null }> {
  return resolveReadme(fetcherFor(accessToken, ref, tag), parsed)
}

// Asset-first manifest resolution: scan the release's published assets for
// any filename in the configured candidate list and ingest that. Avoids the
// race + auth flakiness of the git-ref fetch path because release assets are
// immutable per release and served by the forge's CDN.
//
// The README is not a release asset, so it is read from the repo at the
// release's tag when `readmeAt` is supplied. A tag is immutable, so that is
// the same content the release shipped with — without it the plugin's README
// would be blank for every asset-resolved release.
export async function resolveManifestFromReleaseAssets(
  accessToken: string,
  assets: ReleaseAsset[],
  readmeAt?: { ref: RepoRef; tag: string },
): Promise<ResolvedManifest | null> {
  if (assets.length === 0) return null
  const byName = new Map(assets.map((a) => [a.name, a]))
  for (const candidate of manifestCandidates()) {
    // GitHub rejects release asset names with a leading dot and silently
    // renames them on upload (".tabularium" → "default.tabularium"), so a
    // dotfile candidate must also match its renamed form.
    const asset =
      byName.get(candidate.path) ??
      (candidate.path.startsWith('.') ? byName.get(`default${candidate.path}`) : undefined)
    if (!asset) continue
    try {
      const got = await fetchAssetContent(asset.url, accessToken)
      if (!got) continue
      if (got.bytes > MAX_BYTES) {
        log.warn({ path: candidate.path, bytes: got.bytes }, 'asset manifest exceeds size cap — ignored')
        continue
      }
      const parsed = parseManifestText(got.content)
      if (!readmeAt) return { raw: got.content, parsed, readmeMarkdown: null, readmeLocales: null }
      const { readmeMarkdown, readmeLocales } = await resolveReadme(
        fetcherFor(accessToken, readmeAt.ref, readmeAt.tag),
        parsed,
      )
      return { raw: got.content, parsed, readmeMarkdown, readmeLocales }
    } catch (err) {
      if (err instanceof UpstreamUnauthorizedError) throw err
      if (err instanceof ManifestValidationError) {
        log.warn({ path: candidate.path, errors: err.errors }, 'asset manifest invalid — trying next candidate')
      } else {
        log.warn({ err, path: candidate.path }, 'asset manifest fetch/parse failed — trying next candidate')
      }
    }
  }
  return null
}

export async function resolveManifest(
  accessToken: string,
  ref: RepoRef,
  options: { ref?: string } = {},
): Promise<ResolvedManifest | null> {
  const fetch = fetcherFor(accessToken, ref, options.ref)
  // Distinguish "file found but invalid" from "no file at all": if any
  // candidate existed but failed validation, rethrow that error after the
  // loop so callers can surface the actual validation errors instead of a
  // misleading "no manifest file found".
  let invalid: ManifestValidationError | null = null
  for (const candidate of manifestCandidates()) {
    try {
      const got = await fetch(candidate.path)
      if (!got) continue
      if (got.bytes > MAX_BYTES) {
        log.warn({ path: candidate.path, bytes: got.bytes }, 'manifest exceeds size cap — ignored')
        continue
      }
      const parsed = parseManifestText(got.content)
      const { readmeMarkdown, readmeLocales } = await resolveReadme(fetch, parsed)
      return { raw: got.content, parsed, readmeMarkdown, readmeLocales }
    } catch (err) {
      if (err instanceof UpstreamUnauthorizedError) throw err
      if (err instanceof ManifestValidationError) {
        invalid = err
        log.warn({ path: candidate.path, errors: err.errors }, 'manifest invalid — trying next candidate')
      } else {
        log.warn({ err, path: candidate.path }, 'manifest fetch/parse failed — trying next candidate')
      }
    }
  }
  if (invalid) throw invalid
  return null
}
