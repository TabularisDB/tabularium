// Shapes returned by /api/admin/webhooks*. Kept local: the Eden client is
// untyped (see packages/client), so pages hand-type their responses.

export type HeaderRow = { name: string; value: string }

export type WebhookView = {
  id: string
  name: string
  enabled: boolean
  preset: string | null
  events: string[]
  method: string
  url: string
  headers: HeaderRow[]
  body: string | null
  contentType: string
  secretNames: string[]
  hasSigningSecret: boolean
  createdAt: number
  updatedAt: number
}

export type WebhookPreset = {
  key: string
  label: string
  description: string
  method: string
  url: string
  headers: HeaderRow[]
  body: string
  contentType: string
  secrets: string[]
}

export type WebhookMeta = {
  events: string[]
  presets: WebhookPreset[]
  placeholders: Array<{ path: string; description: string }>
  filters: Array<{ name: string; description: string }>
}

export type RenderedRequest = {
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
  missing: string[]
}

export type DeliveryView = {
  id: string
  webhookId: string
  event: string
  status: 'pending' | 'sending' | 'success' | 'failed'
  attempts: number
  nextAttemptAt: number | null
  lastStatusCode: number | null
  lastError: string | null
  request: { method: string; url: string; headers: Record<string, string>; body: string | null } | null
  responseBody: string | null
  durationMs: number | null
  createdAt: number
  completedAt: number | null
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: init.body ? { 'content-type': 'application/json', ...init.headers } : init.headers,
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
    throw new Error(data?.error ?? data?.message ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

// Pretty-print JSON bodies for display; leave anything else untouched.
export function prettyBody(body: string | null): string {
  if (!body) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

// Plain-text rendering of a request for <pre> blocks; built in script so
// formatters can't inject whitespace into the template.
export function requestText(r: { method: string; url: string; headers: Record<string, string>; body: string | null }) {
  const headers = Object.entries(r.headers).map(([k, v]) => `${k}: ${v}\n`)
  return `${r.method} ${r.url}\n${headers.join('')}${prettyBody(r.body)}`
}
