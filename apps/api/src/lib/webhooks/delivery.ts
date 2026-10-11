import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { and, asc, eq, inArray, lte } from 'drizzle-orm'
import { db } from '$db'
import { webhookDeliveries, type webhooks } from '$db/schema'
import { decryptToken } from '$lib/crypto'
import { getSetting } from '$lib/settings'
import { logger } from '$lib/logger'
import { renderTemplate, TemplateError, type EscapeMode } from './template'

const log = logger.child({ module: 'webhooks' })

export const MAX_ATTEMPTS = 5
// Delay before attempt n+1, indexed by attempts already made (1-based).
const RETRY_DELAYS_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000]
const TIMEOUT_MS = 10_000
const LEASE_MS = 5 * 60_000
const RESPONSE_SNIPPET = 4096
const MASK = '••••••••'

// Admin opt-in for self-hosted setups that notify services on the LAN.
export const ALLOW_PRIVATE_SETTING = 'webhooks.allow_private_targets'

export type WebhookRow = typeof webhooks.$inferSelect
export type HeaderTemplate = { name: string; value: string }

export type RenderedRequest = {
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
  missing: string[]
}

// Non-retryable: retrying cannot change the outcome (bad template, blocked target).
export class DeliveryConfigError extends Error {}

export function decodeSecrets(row: Pick<WebhookRow, 'secrets'>): Record<string, string> {
  if (!row.secrets) return {}
  try {
    return JSON.parse(decryptToken(row.secrets)) as Record<string, string>
  } catch {
    return {}
  }
}

export function decodeSigningSecret(row: Pick<WebhookRow, 'signingSecret'>): string | null {
  if (!row.signingSecret) return null
  try {
    return decryptToken(row.signingSecret)
  } catch {
    return null
  }
}

export function parseHeaders(json: string): HeaderTemplate[] {
  try {
    const v = JSON.parse(json) as unknown
    return Array.isArray(v) ? (v as HeaderTemplate[]) : []
  } catch {
    return []
  }
}

function bodyMode(contentType: string): EscapeMode {
  const ct = contentType.toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('x-www-form-urlencoded')) return 'url'
  return 'text'
}

export function signBody(secret: string, timestamp: string, body: string): string {
  const hasher = new Bun.CryptoHasher('sha256', secret)
  hasher.update(`${timestamp}.${body}`)
  return 'sha256=' + hasher.digest('hex')
}

type RenderableWebhook = Pick<WebhookRow, 'method' | 'url' | 'headers' | 'body' | 'contentType'>

// Render a webhook definition against an event context. Throws
// DeliveryConfigError on template errors or a body that is not valid JSON.
export function renderRequest(
  hook: RenderableWebhook,
  ctx: Record<string, unknown>,
  secrets: Record<string, string>,
  extra: { deliveryId: string; event: string; signingSecret: string | null },
): RenderedRequest {
  const scope = { ...ctx, secrets }
  const missing = new Set<string>()
  const render = (src: string, mode: EscapeMode) => {
    const r = renderTemplate(src, scope, mode)
    for (const m of r.missing) missing.add(m)
    return r.output
  }

  try {
    const url = render(hook.url, 'url').trim()
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new DeliveryConfigError(`rendered URL is not valid: "${url.slice(0, 200)}"`)
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new DeliveryConfigError(`unsupported URL scheme "${parsed.protocol}"`)
    }

    const method = hook.method.toUpperCase()
    const hasBody = method !== 'GET' && method !== 'HEAD'
    let body: string | null = null
    if (hasBody && hook.body) {
      body = render(hook.body, bodyMode(hook.contentType))
      if (bodyMode(hook.contentType) === 'json') {
        try {
          JSON.parse(body)
        } catch (err) {
          throw new DeliveryConfigError(`rendered body is not valid JSON: ${(err as Error).message}`)
        }
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Tabularium-Webhooks/1.0',
      'X-Tabularium-Event': extra.event,
      'X-Tabularium-Delivery': extra.deliveryId,
    }
    if (body !== null) headers['Content-Type'] = hook.contentType
    for (const h of parseHeaders(hook.headers)) {
      // Template headers override defaults; header names are case-insensitive.
      for (const k of Object.keys(headers)) if (k.toLowerCase() === h.name.toLowerCase()) delete headers[k]
      headers[h.name] = render(h.value, 'header')
    }
    if (extra.signingSecret) {
      const ts = String(Math.floor(Date.now() / 1000))
      headers['X-Tabularium-Timestamp'] = ts
      headers['X-Tabularium-Signature'] = signBody(extra.signingSecret, ts, body ?? '')
    }

    return { method, url, headers, body, missing: [...missing] }
  } catch (err) {
    if (err instanceof TemplateError) throw new DeliveryConfigError(`template error: ${err.message}`)
    throw err
  }
}

// Replace every secret value with a mask so stored/previewed requests never leak them.
export function maskRequest(req: RenderedRequest, secrets: string[]): RenderedRequest {
  const values = secrets.filter((s) => s.length >= 4).sort((a, b) => b.length - a.length)
  const mask = (s: string) => values.reduce((acc, v) => acc.split(v).join(MASK), s)
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) headers[k] = mask(v)
  return { ...req, url: mask(req.url), headers, body: req.body === null ? null : mask(req.body) }
}

// --- SSRF guard ---------------------------------------------------------

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Private(ip)
  const lower = ip.toLowerCase()
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4Private(mapped[1])
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith('ff')
  )
}

export async function assertPublicTarget(url: string): Promise<void> {
  if (getSetting(ALLOW_PRIVATE_SETTING) === '1') return
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new DeliveryConfigError(`target "${host}" is a private address`)
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new DeliveryConfigError(`target "${host}" resolves to private address ${a.address}`)
    }
  }
}

// --- Sending -------------------------------------------------------------

export type SendResult = {
  ok: boolean
  statusCode: number | null
  error: string | null
  responseBody: string | null
  durationMs: number
  retryable: boolean
}

export async function sendRequest(req: RenderedRequest): Promise<SendResult> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  try {
    await assertPublicTarget(req.url)
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ?? undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = (await res.text().catch(() => '')).slice(0, RESPONSE_SNIPPET)
    const ok = res.status >= 200 && res.status < 300
    return {
      ok,
      statusCode: res.status,
      error: ok ? null : `HTTP ${res.status}`,
      responseBody: text || null,
      durationMs: elapsed(),
      // 4xx means the request itself is wrong; only throttling/timeouts are worth retrying.
      retryable: !ok && (res.status >= 500 || res.status === 408 || res.status === 429),
    }
  } catch (err) {
    const config = err instanceof DeliveryConfigError
    return {
      ok: false,
      statusCode: null,
      error: (err as Error).message,
      responseBody: null,
      durationMs: elapsed(),
      retryable: !config,
    }
  }
}

// Claim a due delivery with a lease so concurrent workers never double-send.
async function claim(id: string): Promise<boolean> {
  const now = Date.now()
  const lease = now + LEASE_MS + Math.floor(Math.random() * 1000)
  await db
    .update(webhookDeliveries)
    .set({ status: 'sending', nextAttemptAt: lease })
    .where(
      and(
        eq(webhookDeliveries.id, id),
        inArray(webhookDeliveries.status, ['pending', 'sending']),
        lte(webhookDeliveries.nextAttemptAt, now),
      ),
    )
  const row = await db.query.webhookDeliveries.findFirst({
    where: { id },
    columns: { status: true, nextAttemptAt: true },
  })
  return row?.status === 'sending' && row.nextAttemptAt === lease
}

export type AttemptOptions = {
  // Send even if the webhook is disabled (admin "send test").
  allowDisabled?: boolean
  // false = one-shot: a failure is final instead of scheduling a retry.
  retry?: boolean
}

export async function attemptDelivery(id: string, opts: AttemptOptions = {}): Promise<void> {
  if (!(await claim(id))) return
  const delivery = await db.query.webhookDeliveries.findFirst({ where: { id } })
  if (!delivery) return
  const hook = await db.query.webhooks.findFirst({ where: { id: delivery.webhookId } })

  const finish = async (patch: Partial<typeof webhookDeliveries.$inferInsert>) => {
    await db.update(webhookDeliveries).set(patch).where(eq(webhookDeliveries.id, id))
  }

  const attempts = delivery.attempts + 1
  if (!hook || (hook.enabled !== 1 && !opts.allowDisabled)) {
    await finish({ status: 'failed', attempts, lastError: 'webhook disabled or deleted', completedAt: Date.now() })
    return
  }

  const secrets = decodeSecrets(hook)
  let rendered: RenderedRequest
  try {
    rendered = renderRequest(hook, JSON.parse(delivery.payload) as Record<string, unknown>, secrets, {
      deliveryId: id,
      event: delivery.event,
      signingSecret: decodeSigningSecret(hook),
    })
  } catch (err) {
    await finish({ status: 'failed', attempts, lastError: (err as Error).message, completedAt: Date.now() })
    return
  }

  const result = await sendRequest(rendered)
  const masked = maskRequest(rendered, Object.values(secrets))
  const common = {
    attempts,
    lastStatusCode: result.statusCode,
    lastError: result.error,
    responseBody: result.responseBody,
    durationMs: result.durationMs,
    request: JSON.stringify({ method: masked.method, url: masked.url, headers: masked.headers, body: masked.body }),
  }
  if (result.ok) {
    await finish({ ...common, status: 'success', nextAttemptAt: null, completedAt: Date.now() })
  } else if (result.retryable && opts.retry !== false && attempts < MAX_ATTEMPTS) {
    await finish({ ...common, status: 'pending', nextAttemptAt: Date.now() + RETRY_DELAYS_MS[attempts] })
    log.warn({ id, webhookId: hook.id, attempts, error: result.error }, 'webhook delivery failed — will retry')
  } else {
    await finish({ ...common, status: 'failed', nextAttemptAt: null, completedAt: Date.now() })
    log.warn({ id, webhookId: hook.id, attempts, error: result.error }, 'webhook delivery failed permanently')
  }
}

// Fire-and-forget first attempt right after the triggering request.
export function scheduleDelivery(id: string): void {
  queueMicrotask(() => {
    attemptDelivery(id).catch((err) => log.error({ err, id }, 'webhook delivery crashed'))
  })
}

export async function processDueDeliveries(limit = 20): Promise<number> {
  const due = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(
      and(inArray(webhookDeliveries.status, ['pending', 'sending']), lte(webhookDeliveries.nextAttemptAt, Date.now())),
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(limit)
  for (const { id } of due) {
    await attemptDelivery(id).catch((err) => log.error({ err, id }, 'webhook delivery crashed'))
  }
  return due.length
}

let timer: ReturnType<typeof setInterval> | null = null

// Retries and crash recovery (expired leases). First attempts don't wait for this.
export function startWebhookWorker(intervalMs = 30_000): void {
  if (timer) return
  timer = setInterval(() => {
    processDueDeliveries().catch((err) => log.error({ err }, 'webhook worker tick failed'))
  }, intervalMs)
  timer.unref?.()
}
