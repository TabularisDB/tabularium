import { Elysia, t } from 'elysia'
import { desc, count, eq, and } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { auditLog } from '$db/schema'

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Number(raw ?? def)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export default new Elysia().use(adminMiddleware).get(
  '/',
  async ({ query }) => {
    const page = clampInt(query.page, 1, 1, 10_000)
    const limit = clampInt(query.limit, 50, 1, 200)
    const offset = (page - 1) * limit

    const conditions = []
    if (query.action) conditions.push(eq(auditLog.action, query.action))
    if (query.actorId) conditions.push(eq(auditLog.actorId, query.actorId))
    const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions)

    const [{ total }] = await db.select({ total: count() }).from(auditLog).where(where)
    const rows = await db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset)
    return {
      total,
      page,
      limit,
      entries: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorName,
        action: r.action,
        target: r.target,
        meta: r.meta,
        ip: r.ip,
        createdAt: r.createdAt,
      })),
    }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'List audit log entries',
      operationId: 'listAudit',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    query: t.Object({
      action: t.Optional(t.String()),
      actorId: t.Optional(t.String()),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({
        total: t.Number(),
        page: t.Number(),
        limit: t.Number(),
        entries: t.Array(
          t.Object({
            id: t.String(),
            actorId: t.Nullable(t.String()),
            actorName: t.Nullable(t.String()),
            action: t.String(),
            target: t.Nullable(t.String()),
            meta: t.Nullable(t.String()),
            ip: t.Nullable(t.String()),
            createdAt: t.Number(),
          }),
        ),
      }),
    },
  },
)
