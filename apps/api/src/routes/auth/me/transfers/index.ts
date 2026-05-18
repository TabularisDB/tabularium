import { Elysia, t } from 'elysia'
import { eq, or, desc } from 'drizzle-orm'
import { authMiddleware } from '$middleware/auth'
import { db } from '$db'
import { pluginTransfers } from '$db/schema'
import { expireStalePending } from '$lib/transfers'

const STATUS = t.Union([
  t.Literal('pending'),
  t.Literal('accepted'),
  t.Literal('rejected'),
  t.Literal('cancelled'),
  t.Literal('expired'),
])

const transferRowSchema = t.Object({
  id: t.String(),
  pluginId: t.String(),
  pluginName: t.String(),
  fromUserId: t.String(),
  fromName: t.String(),
  toUserId: t.String(),
  toName: t.String(),
  status: STATUS,
  message: t.Nullable(t.String()),
  createdAt: t.Number(),
  expiresAt: t.Number(),
  respondedAt: t.Nullable(t.Number()),
  direction: t.Union([t.Literal('incoming'), t.Literal('outgoing')]),
})

export default new Elysia().use(authMiddleware).get(
  '/',
  async ({ user }) => {
    await expireStalePending()
    const rows = await db
      .select({
        id: pluginTransfers.id,
        pluginId: pluginTransfers.pluginId,
        fromUserId: pluginTransfers.fromUserId,
        toUserId: pluginTransfers.toUserId,
        status: pluginTransfers.status,
        message: pluginTransfers.message,
        createdAt: pluginTransfers.createdAt,
        expiresAt: pluginTransfers.expiresAt,
        respondedAt: pluginTransfers.respondedAt,
      })
      .from(pluginTransfers)
      .where(or(eq(pluginTransfers.fromUserId, user.sub), eq(pluginTransfers.toUserId, user.sub)))
      .orderBy(desc(pluginTransfers.createdAt))

    const pluginIds = [...new Set(rows.map((r) => r.pluginId))]
    const userIds = [...new Set(rows.flatMap((r) => [r.fromUserId, r.toUserId]))]

    const pluginRows =
      pluginIds.length === 0 ? [] : await db.query.plugins.findMany({ where: { id: { in: pluginIds } } })
    const userRows = userIds.length === 0 ? [] : await db.query.users.findMany({ where: { id: { in: userIds } } })
    const pluginNames = new Map(pluginRows.map((p: { id: string; name: string }) => [p.id, p.name]))
    const userNames = new Map(userRows.map((u: { id: string; displayName: string }) => [u.id, u.displayName]))

    return {
      transfers: rows.map((r: (typeof rows)[number]) => ({
        id: r.id,
        pluginId: r.pluginId,
        pluginName: pluginNames.get(r.pluginId) ?? r.pluginId,
        fromUserId: r.fromUserId,
        fromName: userNames.get(r.fromUserId) ?? r.fromUserId,
        toUserId: r.toUserId,
        toName: userNames.get(r.toUserId) ?? r.toUserId,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        respondedAt: r.respondedAt,
        direction: (r.toUserId === user.sub ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
      })),
    }
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'List plugin transfers involving the current user',
      description:
        'Returns both incoming (you are the recipient) and outgoing (you initiated) transfers. Each row carries plugin + actor names already joined in.',
      operationId: 'listTransfers',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ transfers: t.Array(transferRowSchema) }) },
  },
)
