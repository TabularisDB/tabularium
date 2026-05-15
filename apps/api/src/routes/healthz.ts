import { Elysia, t } from 'elysia'
import { sql } from 'drizzle-orm'
import { db } from '$db'
import { cache, isString } from '$lib/cache'
import { storage } from '$lib/storage'

const startedAt = Date.now()

export default new Elysia()
  .get('/', async ({ set }) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {}

    try {
      await db.run(sql`SELECT 1`)
      checks.db = { ok: true }
    } catch (err) {
      checks.db = { ok: false, detail: err instanceof Error ? err.message : String(err) }
    }

    try {
      await cache().set('healthz:ping', '1', 5)
      const v = await cache().get<string>('healthz:ping', isString)
      checks.cache = v === '1'
        ? { ok: true, detail: `driver=${cache().driver}` }
        : { ok: false, detail: `roundtrip mismatch (driver=${cache().driver})` }
    } catch (err) {
      checks.cache = { ok: false, detail: err instanceof Error ? err.message : String(err) }
    }

    try {
      checks.storage = { ok: true, detail: `driver=${storage().driver}` }
    } catch (err) {
      checks.storage = { ok: false, detail: err instanceof Error ? err.message : String(err) }
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
