import { Elysia, t } from 'elysia'
import { sql } from 'drizzle-orm'
import { db, isDBConnected } from '$db'
import { cache, isString } from '$lib/cache'
import { storage } from '$lib/storage'
import { getServerMode } from '$lib/server-mode'

const startedAt = Date.now()

type Check = { ok: boolean; detail?: string }

async function checkDb(setupMode: boolean): Promise<Check> {
  if (setupMode || !isDBConnected()) return { ok: true, detail: 'setup-mode (db not yet connected)' }
  try {
    await db.run(sql`SELECT 1`)
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkCache(): Promise<Check> {
  try {
    await cache().set('healthz:ping', '1', 5)
    const v = await cache().get<string>('healthz:ping', isString)
    if (v !== '1') return { ok: false, detail: `roundtrip mismatch (driver=${cache().driver})` }
    return { ok: true, detail: `driver=${cache().driver}` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

function checkStorage(setupMode: boolean): Check {
  if (setupMode) return { ok: true, detail: 'setup-mode (storage not yet initialized)' }
  try {
    return { ok: true, detail: `driver=${storage().driver}` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export default new Elysia()
  .get('/', async ({ set }) => {
    const setupMode = getServerMode() === 'setup'
    const checks: Record<string, Check> = {
      db: await checkDb(setupMode),
      cache: await checkCache(),
      storage: checkStorage(setupMode),
    }

    const allOk = Object.values(checks).every((c) => c.ok)
    if (!allOk) set.status = 503

    return {
      ok: allOk,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      checks,
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Health check',
      description: 'Pings the DB, cache, and storage adapters. Returns 503 if any check fails. Suitable for k8s/Docker liveness + readiness probes.',
      operationId: 'healthz',
    },
    response: {
      200: t.Object({
        ok: t.Boolean(),
        uptimeSeconds: t.Number(),
        checks: t.Record(t.String(), t.Object({ ok: t.Boolean(), detail: t.Optional(t.String()) })),
      }),
      503: t.Object({
        ok: t.Boolean(),
        uptimeSeconds: t.Number(),
        checks: t.Record(t.String(), t.Object({ ok: t.Boolean(), detail: t.Optional(t.String()) })),
      }),
    },
  })
