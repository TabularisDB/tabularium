import { sql } from 'drizzle-orm'
import { db, isDBConnected, getDialect } from '$db'
import { cache, isString } from '$lib/cache'
import { storage } from '$lib/storage'
import { getServerMode } from '$lib/server-mode'

export type CheckResult = { ok: boolean; detail?: string }

export async function checkDb(setupMode: boolean): Promise<CheckResult> {
  if (setupMode || !isDBConnected()) return { ok: true, detail: 'setup-mode (db not yet connected)' }
  try {
    await db.run(sql`SELECT 1`)
    return { ok: true, detail: `dialect=${getDialect()}` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function checkCache(): Promise<CheckResult> {
  try {
    await cache().set('healthz:ping', '1', 5)
    const v = await cache().get<string>('healthz:ping', isString)
    return v === '1'
      ? { ok: true, detail: `driver=${cache().driver}` }
      : { ok: false, detail: `roundtrip mismatch (driver=${cache().driver})` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export function checkStorage(setupMode: boolean): CheckResult {
  if (setupMode) return { ok: true, detail: 'setup-mode (storage not yet initialized)' }
  try {
    return { ok: true, detail: `driver=${storage().driver}` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function runAllChecks(): Promise<{
  ok: boolean
  checks: { db: CheckResult; cache: CheckResult; storage: CheckResult }
}> {
  const setupMode = getServerMode() === 'setup'
  const checks = {
    db: await checkDb(setupMode),
    cache: await checkCache(),
    storage: checkStorage(setupMode),
  }
  return { ok: Object.values(checks).every((c) => c.ok), checks }
}
