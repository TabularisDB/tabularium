import type { plugins as pluginsTable, releases as releasesTable } from '../db/schema'
import { parseAssets } from './asset'

type PluginRow = typeof pluginsTable.$inferSelect
type ReleaseRow = typeof releasesTable.$inferSelect

export type Screenshot = { url: string; caption: string | null; alt: string | null }

export type PublicPlugin = {
  id: string
  ownerId: string
  providerInstanceId: string | null
  name: string
  description: string
  author: string
  repoUrl: string
  homepage: string
  latestVersion: string | null
  status: PluginRow['status']
  category: string | null
  tags: string[]
  license: string | null
  iconUrl: string | null
  screenshots: Screenshot[]
  documentationUrl: string | null
  supportEmail: string | null
  issuesUrl: string | null
  featured: boolean
  featuredOrder: number | null
  downloads: number
  manifestFetchedAt: number | null
  createdAt: number
  updatedAt: number
}

export type PublicPluginDetail = PublicPlugin & {
  readmeMarkdown: string | null
  releases: Array<{
    id: string
    pluginId: string
    version: string
    minRuntimeVersion: string | null
    assets: ReturnType<typeof parseAssets>
    createdAt: number
  }>
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function projectPlugin(row: PluginRow): PublicPlugin {
  return {
    id: row.id,
    ownerId: row.ownerId,
    providerInstanceId: row.providerInstanceId ?? null,
    name: row.name,
    description: row.description,
    author: row.author,
    repoUrl: row.repoUrl,
    homepage: row.homepage,
    latestVersion: row.latestVersion,
    status: row.status,
    category: row.category ?? null,
    tags: parseJsonArray<string>(row.tags),
    license: row.license ?? null,
    iconUrl: row.iconUrl ?? null,
    screenshots: parseJsonArray<Screenshot>(row.screenshots),
    documentationUrl: row.documentationUrl ?? null,
    supportEmail: row.supportEmail ?? null,
    issuesUrl: row.issuesUrl ?? null,
    featured: row.featured === 1,
    featuredOrder: row.featuredOrder ?? null,
    downloads: row.downloads ?? 0,
    manifestFetchedAt: row.manifestFetchedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function projectPluginDetail(row: PluginRow & { releases: ReleaseRow[] }): PublicPluginDetail {
  return {
    ...projectPlugin(row),
    readmeMarkdown: row.readme ?? null,
    releases: row.releases.map((r) => ({
      id: r.id,
      pluginId: r.pluginId,
      version: r.version,
      minRuntimeVersion: r.minRuntimeVersion,
      assets: parseAssets(r.assets),
      createdAt: r.createdAt,
    })),
  }
}
