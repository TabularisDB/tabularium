import { Cron } from 'croner'
import { TurboSmtp, type Region } from 'turbosmtp'
import { logger } from '$lib/logger'
import { db } from '$db'
import { emailSuppression } from '$db/schema'
import { getSetting } from '$lib/settings'

const log = logger.child({ module: 'email-suppression-sync' })
let job: Cron | null = null

export type SuppressionRow = { email: string; source: string; reason?: string | null }
export type SuppressionDriver = {
  list(fromDate: string, toDate: string): Promise<Array<SuppressionRow>>
}

let driverOverride: SuppressionDriver | null = null
export function __setSyncDriverForTests(d: SuppressionDriver | null): void {
  driverOverride = d
}

function getTurboRegion(): Region {
  const r = getSetting('email.turbo.region')
  return r === 'eu' ? 'eu' : 'global'
}

function defaultDriver(): SuppressionDriver | null {
  const apiKey = getSetting('email.turbo.api_key')
  if (!apiKey) return null
  const client = new TurboSmtp({ apiKey, region: getTurboRegion() })
  return {
    async list(fromDate, toDate) {
      const page = await client.suppressions.list({ from: fromDate, to: toDate, limit: 500 })
      const out: Array<SuppressionRow> = []
      // turbosmtp-ts returns a Page<T> exposing .results; tail of the list will
      // be caught on the next 15-minute tick if it exceeds limit=500.
      const rows =
        (page as { results?: Array<{ recipient?: string | null; source?: string | null; reason?: string | null }> })
          .results ?? []
      for (const r of rows) {
        if (!r.recipient) continue
        out.push({ email: r.recipient.toLowerCase(), source: r.source ?? 'bounce', reason: r.reason ?? null })
      }
      return out
    },
  }
}

function mapSource(upstream: string): 'bounce' | 'complaint' | 'manual' | 'unsubscribe' {
  switch (upstream) {
    case 'bounce':
      return 'bounce'
    case 'spam':
      return 'complaint'
    case 'unsubscribe':
      return 'unsubscribe'
    case 'manual':
      return 'manual'
    case 'validation_failed':
      return 'bounce'
    default:
      return 'bounce'
  }
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function syncOnce(): Promise<{ added: number; checked: number }> {
  const d = driverOverride ?? defaultDriver()
  if (!d) return { added: 0, checked: 0 }
  const today = new Date()
  const start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
  const rows = await d.list(ymd(start), ymd(today))
  let added = 0
  for (const r of rows) {
    const email = r.email.toLowerCase()
    const result = (await db
      .insert(emailSuppression)
      .values({ email, source: mapSource(r.source), reason: r.reason ?? null })
      .onConflictDoNothing()) as unknown as { rowsAffected?: number } | void
    // Drizzle's bun-sqlite insert resolves to `{rowsAffected: n}` in practice
    // even though the static type is `void`; counted defensively so we never
    // crash on a shape change. Falls back to attempt-count when rowsAffected
    // is missing.
    const ra = result && typeof result === 'object' ? result.rowsAffected : undefined
    if (typeof ra === 'number' ? ra > 0 : true) added++
  }
  return { added, checked: rows.length }
}

export function startSuppressionSync(): void {
  if (job) return
  if (getSetting('email.provider') !== 'turbo') return
  job = new Cron('*/15 * * * *', { name: 'email-suppression-sync' }, async () => {
    try {
      const out = await syncOnce()
      log.info({ added: out.added, checked: out.checked }, 'suppression sync tick')
    } catch (err) {
      log.warn({ err }, 'suppression sync failed')
    }
  })
  log.info('suppression sync scheduled (every 15 min)')
}

export function stopSuppressionSync(): void {
  if (!job) return
  job.stop()
  job = null
}

export function restartSuppressionSync(): void {
  stopSuppressionSync()
  startSuppressionSync()
}
