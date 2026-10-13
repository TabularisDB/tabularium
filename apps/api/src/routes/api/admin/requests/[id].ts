import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { pluginRequests, pluginRequestVotes, pluginRequestClaims } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { isKindKey } from '$lib/kinds'
import { bountySchema } from '$lib/request-bounty'
import { requestViewSchema, toRequestView } from '$lib/request-view'
import { emitEvent, type WebhookEvent } from '$lib/webhooks/events'

const errorSchema = t.Object({ error: t.String() })

const AUDIT_ACTION = {
  pending: 'request.reopen',
  approved: 'request.approve',
  rejected: 'request.reject',
  fulfilled: 'request.fulfill',
} as const

export default new Elysia()
  .use(adminMiddleware)
  .patch(
    '/',
    async ({ params, body, set, admin, request }) => {
      const row = await db.query.pluginRequests.findFirst({ where: { id: params.id } })
      if (!row) {
        set.status = 404
        return { error: 'Request not found' }
      }
      if (body.kind !== undefined && body.kind !== null && !isKindKey(body.kind)) {
        set.status = 400
        return { error: `Unknown plugin kind '${body.kind}'.` }
      }

      const now = Date.now()
      const patch: Partial<typeof pluginRequests.$inferInsert> = { updatedAt: now }
      if (body.name !== undefined) patch.name = body.name
      if (body.description !== undefined) patch.description = body.description
      if (body.kind !== undefined) patch.kind = body.kind
      if (body.bounty !== undefined) patch.bounty = body.bounty === null ? null : JSON.stringify(body.bounty)
      // Backfilling history (e.g. requests imported from a curated list).
      if (body.createdAt !== undefined) patch.createdAt = body.createdAt

      let event: WebhookEvent | null = null
      if (body.status !== undefined && body.status !== row.status) {
        patch.status = body.status
        patch.reviewedBy = admin.id
        patch.reviewedAt = now
        patch.rejectionReason = body.status === 'rejected' ? (body.rejectionReason ?? null) : null
        if (body.status === 'fulfilled') {
          const pluginId = body.fulfilledPluginId ?? row.slug
          const plugin = await db.query.plugins.findFirst({ where: { id: pluginId }, columns: { id: true } })
          if (!plugin) {
            set.status = 400
            return { error: `No plugin '${pluginId}' to link the request to.` }
          }
          patch.fulfilledPluginId = plugin.id
          patch.fulfilledAt = body.fulfilledAt ?? now
        } else {
          patch.fulfilledPluginId = null
          patch.fulfilledAt = null
        }
        if (body.status === 'approved') event = 'request.approved'
        else if (body.status === 'rejected') event = 'request.rejected'
        else if (body.status === 'fulfilled') event = 'request.fulfilled'
      } else if (body.status === 'rejected' && body.rejectionReason !== undefined) {
        patch.rejectionReason = body.rejectionReason
      }
      // Only a shipped request has a shipping date.
      if (body.fulfilledAt !== undefined && (patch.status ?? row.status) === 'fulfilled') {
        patch.fulfilledAt = body.fulfilledAt
      }

      await db.update(pluginRequests).set(patch).where(eq(pluginRequests.id, params.id))
      const updated = (await db.query.pluginRequests.findFirst({ where: { id: params.id } }))!
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: patch.status ? AUDIT_ACTION[patch.status] : 'request.update',
        target: `request:${updated.slug}`,
        meta: { id: updated.id, fields: Object.keys(body) },
      })
      if (event) {
        await emitEvent(event, {
          pluginId: updated.fulfilledPluginId ?? undefined,
          actor: { id: admin.id, name: admin.displayName },
          reason: event === 'request.rejected' ? (updated.rejectionReason ?? null) : null,
          request: updated,
        })
      }
      return toRequestView(updated, admin.id)
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Review or edit a plugin request',
        description:
          'Approve, reject (with an optional reason), reopen as pending or mark fulfilled a request, and edit its name, description, kind and bounty board metadata. `createdAt` and `fulfilledAt` (epoch ms) backfill dates for requests imported from elsewhere; `fulfilledAt` only applies to fulfilled requests. Status changes emit `request.approved`, `request.rejected` or `request.fulfilled`. `fulfilledPluginId` defaults to the request slug.',
        operationId: 'adminUpdateRequest',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        status: t.Optional(
          t.Union([t.Literal('pending'), t.Literal('approved'), t.Literal('rejected'), t.Literal('fulfilled')]),
        ),
        rejectionReason: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
        fulfilledPluginId: t.Optional(t.String({ maxLength: 80 })),
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        description: t.Optional(t.String({ minLength: 1, maxLength: 2000 })),
        kind: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
        bounty: t.Optional(t.Nullable(bountySchema)),
        createdAt: t.Optional(
          t.Integer({ minimum: 0, description: 'When the request was made (epoch ms), to backfill history.' }),
        ),
        fulfilledAt: t.Optional(
          t.Integer({
            minimum: 0,
            description: 'When the request shipped (epoch ms). Only applies to fulfilled requests.',
          }),
        ),
      }),
      response: { 200: requestViewSchema, 400: errorSchema, 404: errorSchema },
    },
  )
  .delete(
    '/',
    async ({ params, set, admin, request }) => {
      const row = await db.query.pluginRequests.findFirst({
        where: { id: params.id },
        columns: { id: true, slug: true },
      })
      if (!row) {
        set.status = 404
        return { error: 'Request not found' }
      }
      await db.delete(pluginRequestVotes).where(eq(pluginRequestVotes.requestId, params.id))
      await db.delete(pluginRequestClaims).where(eq(pluginRequestClaims.requestId, params.id))
      await db.delete(pluginRequests).where(eq(pluginRequests.id, params.id))
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'request.delete',
        target: `request:${row.slug}`,
        meta: { id: row.id, slug: row.slug },
      })
      set.status = 204
      return null
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Delete a plugin request',
        operationId: 'adminDeleteRequest',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      response: {
        204: t.Null(),
        404: errorSchema,
      },
    },
  )
