import { Elysia, t } from 'elysia'
import { and, eq } from 'drizzle-orm'
import { authMiddleware } from '$middleware/auth'
import { db } from '$db'
import { pluginTransfers, plugins } from '$db/schema'
import { recordAudit } from '$lib/audit'
import { expireStalePending } from '$lib/transfers'

const TerminalStatus = t.Union([t.Literal('accepted'), t.Literal('rejected'), t.Literal('cancelled')])

export default new Elysia().use(authMiddleware).post(
  '/',
  async ({ user, params, body, set, request }) => {
    await expireStalePending()
    const transfer = await db.query.pluginTransfers.findFirst({ where: { id: params.id } })
    if (!transfer) {
      set.status = 404
      return { error: 'Transfer not found' }
    }
    if (transfer.status !== 'pending') {
      set.status = 409
      return { error: `Transfer is already ${transfer.status}` }
    }

    const isRecipient = transfer.toUserId === user.sub
    const isSender = transfer.fromUserId === user.sub

    if (body.action === 'cancel' && !isSender) {
      set.status = 403
      return { error: 'Only the sender can cancel a transfer' }
    }
    if ((body.action === 'accept' || body.action === 'reject') && !isRecipient) {
      set.status = 403
      return { error: 'Only the recipient can accept or reject' }
    }

    const status = body.action === 'accept' ? 'accepted' : body.action === 'reject' ? 'rejected' : 'cancelled'
    const now = Date.now()

    // Conditional UPDATE so two concurrent requests can't both flip a single
    // pending transfer. The losing writer's WHERE clause matches zero rows.
    await db
      .update(pluginTransfers)
      .set({ status, respondedAt: now })
      .where(and(eq(pluginTransfers.id, params.id), eq(pluginTransfers.status, 'pending')))

    const after = await db.query.pluginTransfers.findFirst({ where: { id: params.id } })
    if (!after || after.status !== status) {
      set.status = 409
      return { error: `Transfer is already ${after?.status ?? 'unknown'}` }
    }

    if (status === 'accepted') {
      await db
        .update(plugins)
        .set({ ownerId: transfer.toUserId, updatedAt: now })
        .where(eq(plugins.id, transfer.pluginId))
    }

    await recordAudit({
      actorId: user.sub,
      actorName: user.username,
      ip: request.headers.get('x-forwarded-for') ?? null,
      action: `plugin.transfer.${status}`,
      target: `plugin:${transfer.pluginId}`,
      meta: { transferId: transfer.id, fromUserId: transfer.fromUserId, toUserId: transfer.toUserId },
    })

    return { ok: true, status }
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'Respond to a transfer (accept / reject / cancel)',
      description:
        'Recipient: `action=accept` (moves ownership) or `action=reject`. Sender: `action=cancel`. Idempotent — once terminal, returns 409.',
      operationId: 'respondTransfer',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      action: t.Union([t.Literal('accept'), t.Literal('reject'), t.Literal('cancel')]),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), status: TerminalStatus }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  },
)
