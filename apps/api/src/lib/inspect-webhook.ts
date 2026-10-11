import type { RepoRef } from './providers'

export type InstalledWebhook = {
  id: number
  active: boolean
  releaseEvents: boolean
  contentType: string | null
}

export type WebhookInspection = {
  status: 'configured' | 'missing' | 'misconfigured' | 'unknown'
  reason: string | null
  hooks: InstalledWebhook[]
}

type ProviderHook = {
  id: number
  active?: boolean
  events?: string[]
  config?: { url?: string; content_type?: string }
  url?: string
  releases_events?: boolean
  disabled_until?: string | null
  alert_status?: string
}

// Query the repository, rather than remembering whether the install succeeded
// during submission: hooks can be removed or disabled later. Never return the
// provider's full response (which may contain unrelated hooks or secrets).
export async function inspectWebhook(
  accessToken: string,
  ref: RepoRef,
  webhookUrl: string,
): Promise<WebhookInspection> {
  const { kind, baseUrl } = ref.instance
  const apiBase =
    kind === 'github'
      ? baseUrl === 'https://github.com'
        ? 'https://api.github.com'
        : `${baseUrl}/api/v3`
      : `${baseUrl}/api/${kind === 'gitlab' ? 'v4' : 'v1'}`
  const path =
    kind === 'gitlab'
      ? `/projects/${encodeURIComponent(ref.fullName)}/hooks`
      : `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/hooks`
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  if (kind === 'github') {
    headers['User-Agent'] = 'tabularium/1.0'
    headers.Accept = 'application/vnd.github+json'
  }
  const hooks: InstalledWebhook[] = []
  const unknown = (reason: string): WebhookInspection => ({ status: 'unknown', reason, hooks })
  const pageSize = kind === 'gitea' ? 50 : 100

  try {
    // Construct each page ourselves; never forward the token to a Link URL.
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`${apiBase}${path}?${kind === 'gitea' ? 'limit' : 'per_page'}=${pageSize}&page=${page}`, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        if (res.status === 401) return unknown('The owner must re-link their provider account to check webhooks.')
        if (res.status === 403 || res.status === 404)
          return unknown(`Cannot read repository webhooks (HTTP ${res.status}). The owner needs webhook admin access.`)
        return unknown(`The provider returned HTTP ${res.status}. Try checking again later.`)
      }
      const rows = (await res.json()) as ProviderHook[]
      if (!Array.isArray(rows)) return unknown('The provider returned an unexpected response.')
      for (const row of rows) {
        if ((kind === 'gitlab' ? row.url : row.config?.url) !== webhookUrl) continue
        hooks.push({
          id: row.id,
          active:
            kind === 'gitlab'
              ? (!row.disabled_until || Date.parse(row.disabled_until) <= Date.now()) &&
                (!row.alert_status || row.alert_status === 'executable')
              : row.active === true,
          releaseEvents:
            kind === 'gitlab' ? row.releases_events === true : !!row.events?.some((e) => e === 'release' || e === '*'),
          contentType: kind === 'gitlab' ? 'json' : (row.config?.content_type ?? null),
        })
      }
      if (rows.length < pageSize) {
        return {
          status: hooks.some((h) => h.active && h.releaseEvents && h.contentType === 'json')
            ? 'configured'
            : hooks.length > 0
              ? 'misconfigured'
              : 'missing',
          reason: null,
          hooks,
        }
      }
    }
    return unknown('Too many repository webhooks to complete the check.')
  } catch {
    return unknown('Could not read repository webhooks. Try checking again later.')
  }
}
