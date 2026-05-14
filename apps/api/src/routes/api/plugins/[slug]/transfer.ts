import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { authMiddleware } from '$middleware/auth'
import { db } from '$db'
import { pluginTransfers } from '$db/schema'
import { recordAudit } from '$lib/audit'
import { TRANSFER_TTL_MS, expireStalePending } from '$lib/transfers'

export default new Elysia()
  .use(authMiddleware)
  .post('/', async ({ user, params, body, set, request }) => {
    const plugin = await db.query.plugins.findFirst({ where: { id: params.slug } })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    if (plugin.ownerId !== user.sub) {
      set.status = 403
      return { error: 'Only the current owner can initiate a transfer' }
    }
    if (body.newOwnerId === user.sub) {
      set.status = 400
      return { error: 'You already own this plugin' }
    }
    const target = await db.query.users.findFirst({ where: { id: body.newOwnerId } })
    if (!target) {
      set.status = 404
      return { error: 'Recipient user not found — make sure they have signed in at least once' }
    }

    await expireStalePending()
    const existing = await db.query.pluginTransfers.findFirst({
      where: { pluginId: plugin.id, status: 'pending' },
    })
    if (existing) {
      set.status = 409
      return { error: 'A pending transfer already exists for this plugin — cancel it first' }
    }

    const id = ulid()
    const now = Date.now()
    await db.insert(pluginTransfers).values({
      id,
      pluginId: plugin.id,
      fromUserId: user.sub,
      toUserId: body.newOwnerId,
      status: 'pending',
      message: body.message ?? null,
      expiresAt: now + TRANSFER_TTL_MS,
    })

    await recordAudit({
      actorId: user.sub,
      actorName: user.username,
      ip: request.headers.get('x-forwarded-for') ?? null,
      action: 'plugin.transfer.initiate',
      target: `plugin:${plugin.id}`,
      meta: { transferId: id, toUserId: body.newOwnerId },
    })

    return {
      ok: true,
      transferId: id,
      pluginId: plugin.id,
      toUserId: body.newOwnerId,
      expiresAt: now + TRANSFER_TTL_MS,
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Initiate a plugin ownership transfer',
      description:
        'Owner-only. Creates a pending transfer the recipient must accept (or reject) within 7 days. ' +
        'Cancel anytime via `DELETE /auth/me/transfers/:id`. Only one pending transfer per plugin at a time.',
      operationId: 'initiateTransfer',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ slug: t.String() }),
    body: t.Object({
      newOwnerId: t.String(),
      message: t.Optional(t.String({ maxLength: 500 })),
    }),
    response: {
      200: t.Object({
        ok: t.Boolean(),
        transferId: t.String(),
        pluginId: t.String(),
        toUserId: t.String(),
        expiresAt: t.Number(),
      }),
      400: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
