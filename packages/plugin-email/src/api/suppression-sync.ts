import { Cron } from 'croner'
import { db, schema } from './db'
import { host } from './host-handles'
import { log } from './logger'
import type { SuppressionSource, SuppressionRow } from './types'

let job: Cron | null = null

// Legacy type alias — pre-cleanup the croner spoke to its own driver
// interface. Tests still import this name from plugin-email, so keep it as
// a structural alias of `SuppressionSource` (list-only).
export type SuppressionDriver = Pick<SuppressionSource, 'list'>

let driverOverride: SuppressionDriver | null = null
export function __setSyncDriverForTests(d: SuppressionDriver | null): void {
  driverOverride = d
}

export type { SuppressionRow }

/**
 * Iterate over every registered `email-suppression-source` and pull rows from
 * the ones that are active. Returns the aggregated SuppressionRow list.
 */
async function pullFromSources(fromDate: string, toDate: string): Promise<Array<SuppressionRow>> {
  const sources = host().registry.resolveAll<SuppressionSource>('email-suppression-source')
  const out: Array<SuppressionRow> = []
  for (const { impl } of sources) {
    if (!impl.isActive()) continue
    const rows = await impl.list(fromDate, toDate)
    out.push(...rows)
  }
  return out
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
  const today = new Date()
  const start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
  const fromDate = ymd(start)
  const toDate = ymd(today)

  const rows: Array<SuppressionRow> = driverOverride
    ? await driverOverride.list(fromDate, toDate)
    : await pullFromSources(fromDate, toDate)
  if (rows.length === 0) return { added: 0, checked: 0 }
  let added = 0
  for (const r of rows) {
    const email = r.email.toLowerCase()
    const result = (await db()
      .insert(schema.emailSuppression)
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
  if (host().settings.get('email.provider') !== 'turbo') return
  job = new Cron('*/15 * * * *', { name: 'email-suppression-sync' }, async () => {
    try {
      const out = await syncOnce()
      log('email-suppression-sync').info('suppression sync tick', { added: out.added, checked: out.checked })
    } catch (err) {
      log('email-suppression-sync').warn('suppression sync failed', { err })
    }
  })
  log('email-suppression-sync').info('suppression sync scheduled (every 15 min)')
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
