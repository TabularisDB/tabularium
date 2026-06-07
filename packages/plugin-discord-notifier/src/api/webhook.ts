// Discord webhook sender + audit-log writer.
//
// `sendDiscordWebhook()` is the single entrypoint used by event handlers and
// the admin test endpoint. It reads the configured webhook URL and enabled
// events from settings, fires a POST via Bun's built-in fetch, and records
// the outcome in `pl_discord_notifier__webhook_log`. The function never
// throws — failed sends produce a 'failed' row + a failed-status return.

import { ulid } from 'ulid'
import { host } from './host-handles'
import { webhookLog } from './schema'

export interface DiscordWebhookPayload {
  content: string
  username?: string
}

export type SendStatus = 'sent' | 'failed' | 'skipped'

export interface SendOutcome {
  status: SendStatus
  httpStatus?: number
  error?: string
}

export const DEFAULT_ENABLED_EVENTS = [
  'plugin.approved',
  'plugin.rejected',
  'account.welcome',
] as const

function parseEnabledEvents(): string[] {
  const raw = host().settings.get('discord-notifier.enabled_events')
  if (!raw) return [...DEFAULT_ENABLED_EVENTS]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed
  } catch {
    // fall through
  }
  return [...DEFAULT_ENABLED_EVENTS]
}

async function logRow(
  event: string,
  status: SendStatus,
  httpStatus: number | null,
  error: string | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = host().db as any
  await db.insert(webhookLog).values({
    id: ulid(),
    event,
    status,
    httpStatus,
    error,
    sentAt: Date.now(),
  })
}

export async function sendDiscordWebhook(
  payload: DiscordWebhookPayload,
  event: string,
): Promise<SendOutcome> {
  const url = host().settings.get('discord-notifier.webhook_url')
  if (!url) {
    await logRow(event, 'skipped', null, 'no webhook URL configured')
    return { status: 'skipped', error: 'no webhook URL configured' }
  }

  // The synthetic 'test' event always passes the enabled-events gate so the
  // admin can verify the webhook even with every real event disabled.
  if (event !== 'test') {
    const enabled = parseEnabledEvents()
    if (!enabled.includes(event)) {
      await logRow(event, 'skipped', null, 'event disabled in settings')
      return { status: 'skipped', error: 'event disabled' }
    }
  }

  const username = payload.username ?? host().settings.get('discord-notifier.username') ?? 'Tabularium'

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: payload.content, username }),
    })
    if (res.ok) {
      await logRow(event, 'sent', res.status, null)
      return { status: 'sent', httpStatus: res.status }
    }
    let errBody = ''
    try {
      errBody = await res.text()
    } catch {
      // ignore
    }
    await logRow(event, 'failed', res.status, errBody || `http ${res.status}`)
    return { status: 'failed', httpStatus: res.status, error: errBody || `http ${res.status}` }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown'
    await logRow(event, 'failed', null, error)
    return { status: 'failed', error }
  }
}
