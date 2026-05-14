import { eq } from 'drizzle-orm'
import { db } from '../db'
import { plugins } from '../db/schema'
import { resolveAbsolute } from './url'
import type { ResolvedManifest } from './manifest'

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
  manifestFetchedAt: number
  manifestVersion: string | null
  homepage?: string
  updatedAt: number
}

function jsonArray<T>(v: T[] | undefined | null): string | null {
  if (!v || v.length === 0) return null
  return JSON.stringify(v)
}

/**
 * Convert a parsed manifest into a column patch for the `plugins` row.
 * `repoBase` is used to resolve relative icon/screenshot paths to absolute URLs.
 */
export function manifestPatch(
  m: ResolvedManifest,
  opts: { repoBase: string; version: string | null },
): PluginManifestUpdate {
  const { parsed, readmeMarkdown } = m

  const iconUrl = parsed.icon ? resolveAbsolute(opts.repoBase, parsed.icon) : null
  const screenshots = parsed.screenshots?.map((s) => ({
    url: resolveAbsolute(opts.repoBase, s.url),
    caption: s.caption ?? null,
    alt: s.alt ?? null,
  })) ?? []

  const tagList = (parsed.tags ?? []).slice()
  if (parsed.kind && !tagList.includes(parsed.kind)) {
    tagList.unshift(parsed.kind)
  }

  const patch: PluginManifestUpdate = {
    category: parsed.category ?? null,
    tags: jsonArray(tagList),
    license: parsed.license ?? null,
    iconUrl,
    screenshots: jsonArray(screenshots),
    readme: readmeMarkdown ?? null,
    documentationUrl: parsed.documentation_url ?? null,
    supportEmail: parsed.support?.email ?? null,
    issuesUrl: parsed.support?.issues_url ?? null,
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
  await db.update(plugins).set(patch).where(eq(plugins.id, slug))
}
