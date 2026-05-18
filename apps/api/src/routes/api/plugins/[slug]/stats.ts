import { Elysia, t } from 'elysia'
import { db } from '$db'
import { cache } from '$lib/cache'
import { parseRepoUrl } from '$lib/providers'
import { isPublicHttpUrl } from '$lib/url'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'plugin-stats' })

const TTL_SECONDS = 600
const FETCH_TIMEOUT_MS = 10_000

type Stats = {
  stars: number | null
  forks: number | null
  watchers: number | null
  lastPushAt: number | null
  homepage: string | null
}

function isStats(v: unknown): v is Stats {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return 'stars' in o && 'forks' in o
}

async function fetchGithubFlavored(
  apiBase: string,
  owner: string,
  repo: string,
  userAgent: string | null,
): Promise<Stats | null> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (userAgent) headers['User-Agent'] = userAgent
  const url = `${apiBase}/repos/${owner}/${repo}`
  if (!isPublicHttpUrl(url)) return null
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) return null
  const data = (await res.json()) as {
    // GitHub field names
    stargazers_count?: number
    forks_count?: number
    watchers_count?: number
    pushed_at?: string
    // Gitea field names (Codeberg/Forgejo)
    stars_count?: number
    updated_at?: string
    homepage?: string | null
  }
  const stars = data.stargazers_count ?? data.stars_count ?? null
  const pushedAt = data.pushed_at ?? data.updated_at ?? null
  return {
    stars,
    forks: data.forks_count ?? null,
    watchers: data.watchers_count ?? null,
    lastPushAt: pushedAt ? Date.parse(pushedAt) : null,
    homepage: data.homepage ?? null,
  }
}

async function fetchGitlab(baseUrl: string, fullName: string): Promise<Stats | null> {
  const url = `${baseUrl}/api/v4/projects/${encodeURIComponent(fullName)}`
  if (!isPublicHttpUrl(url)) return null
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) return null
  const data = (await res.json()) as {
    star_count?: number
    forks_count?: number
    last_activity_at?: string
    web_url?: string
  }
  return {
    stars: data.star_count ?? null,
    forks: data.forks_count ?? null,
    watchers: null,
    lastPushAt: data.last_activity_at ? Date.parse(data.last_activity_at) : null,
    homepage: data.web_url ?? null,
  }
}

export default new Elysia().get(
  '/',
  async ({ params, set }) => {
    const cacheKey = `plugin:stats:${params.slug}`
    const cached = await cache().get<Stats>(cacheKey, isStats)
    if (cached) return cached

    const plugin = await db.query.plugins.findFirst({ where: { id: params.slug } })
    if (!plugin || plugin.status !== 'approved') {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    const ref = parseRepoUrl(plugin.repoUrl)
    if (!ref) {
      set.status = 422
      return { error: 'Repo URL not parseable for any configured provider instance' }
    }

    let stats: Stats | null = null
    try {
      if (ref.instance.kind === 'github') {
        const apiBase =
          ref.instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${ref.instance.baseUrl}/api/v3`
        stats = await fetchGithubFlavored(apiBase, ref.owner, ref.repo, 'tabularium/1.0')
      } else if (ref.instance.kind === 'gitea') {
        stats = await fetchGithubFlavored(`${ref.instance.baseUrl}/api/v1`, ref.owner, ref.repo, null)
      } else {
        stats = await fetchGitlab(ref.instance.baseUrl, ref.fullName)
      }
    } catch (err) {
      log.warn({ err, slug: params.slug }, 'provider stats fetch failed')
    }

    if (!stats) {
      stats = { stars: null, forks: null, watchers: null, lastPushAt: null, homepage: null }
    }
    await cache().set(cacheKey, stats, TTL_SECONDS)
    return stats
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Provider stats (stars / forks / last push) for a plugin',
      description:
        'Lazily fetched from the upstream provider and cached for 10 minutes. Returns null fields when the provider is unreachable or the repo is private.',
      operationId: 'getPluginStats',
    },
    params: t.Object({ slug: t.String() }),
    response: {
      200: t.Object({
        stars: t.Nullable(t.Number()),
        forks: t.Nullable(t.Number()),
        watchers: t.Nullable(t.Number()),
        lastPushAt: t.Nullable(t.Number()),
        homepage: t.Nullable(t.String()),
      }),
      404: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
    },
  },
)
