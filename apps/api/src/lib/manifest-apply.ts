import { eq } from 'drizzle-orm'
import { db } from '$db'
import { plugins } from '$db/schema'
import { resolveAbsolute } from './url'
import { ManifestSchema, type Manifest, type ResolvedManifest } from './manifest'

export class ManifestVersionMismatchError extends Error {
  readonly declared: string
  readonly expected: string
  constructor(declared: string, expected: string) {
    super(`manifest version "${declared}" does not match release tag v${expected}`)
    this.name = 'ManifestVersionMismatchError'
    this.declared = declared
    this.expected = expected
  }
}

// Throws when the manifest's declared version does not match the tag the
// registry is about to ingest. Keeps the rule in one place so every ingest
// site (webhook refresh, delayed recheck, /api/publish) enforces it the
// same way — the version-in-manifest is the author's stated identity for
// the release; a drift means either a tag mistake or a stale manifest.
export function assertManifestVersionMatches(parsed: Manifest, expectedVersion: string): void {
  const expected = expectedVersion.replace(/^v/, '')
  if (parsed.version !== expected) {
    throw new ManifestVersionMismatchError(parsed.version, expected)
  }
}

const CORE_KEYS = new Set(Object.keys((ManifestSchema as { properties: Record<string, unknown> }).properties))

function extractExtensions(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const ext: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (CORE_KEYS.has(k)) continue
    ext[k] = v
  }
  return Object.keys(ext).length > 0 ? ext : null
}

export type PluginManifestUpdate = {
  name?: string
  description?: string
  category: string | null
  tags: string | null
  license: string | null
  iconUrl: string | null
  screenshots: string | null
  readme: string | null
  documentationUrl: string | null
  supportEmail: string | null
  issuesUrl: string | null
  extensions: string | null
  manifestFetchedAt: number
  manifestVersion: string | null
  homepage?: string
  updatedAt: number
}

import { jsonArrayOrNull as jsonArray } from './util'

/**
 * Convert a parsed manifest into a column patch for the `plugins` row.
 * `repoBase` is used to resolve relative icon/screenshot paths to absolute URLs.
 */
export function manifestPatch(
  m: ResolvedManifest,
  opts: { repoBase: string; version: string | null },
): PluginManifestUpdate {
  const { parsed, readmeMarkdown, readmeLocales } = m
  const readmePayload = readmeLocales ? JSON.stringify(readmeLocales) : (readmeMarkdown ?? null)

  const iconUrl = parsed.icon ? resolveAbsolute(opts.repoBase, parsed.icon) : null
  const screenshots =
    parsed.screenshots?.map((s) => ({
      url: resolveAbsolute(opts.repoBase, s.url),
      caption: s.caption ?? null,
      alt: s.alt ?? null,
    })) ?? []

  const tagList = (parsed.tags ?? []).slice()
  if (parsed.kind && !tagList.includes(parsed.kind)) {
    tagList.unshift(parsed.kind)
  }

  const extensions = extractExtensions(parsed as unknown as Record<string, unknown>)

  const patch: PluginManifestUpdate = {
    category: parsed.category ?? null,
    tags: jsonArray(tagList),
    license: parsed.license ?? null,
    iconUrl,
    screenshots: jsonArray(screenshots),
    readme: readmePayload,
    documentationUrl: parsed.documentation_url ?? null,
    supportEmail: parsed.support?.email ?? null,
    issuesUrl: parsed.support?.issues_url ?? null,
    extensions: extensions ? JSON.stringify(extensions) : null,
    manifestFetchedAt: Date.now(),
    manifestVersion: opts.version,
    updatedAt: Date.now(),
  }
  if (parsed.name) patch.name = parsed.name
  if (parsed.description) patch.description = parsed.description
  if (parsed.homepage) patch.homepage = parsed.homepage
  return patch
}

export async function applyManifestToPlugin(slug: string, patch: PluginManifestUpdate): Promise<void> {
  // The slug is the URL identity and stays immutable. `name` is just the
  // display string — owners control it via the manifest. The old anti-phishing
  // guard that froze the name post-approval did more harm than help (most
  // plugins were stuck on a repo-derived label that the manifest never
  // matched), so it's gone.
  await db.update(plugins).set(patch).where(eq(plugins.id, slug))
}
