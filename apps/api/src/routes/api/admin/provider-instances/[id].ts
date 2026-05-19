import { Elysia, t } from 'elysia'
import { desc, eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { getInstance, updateInstance, deleteInstance, type ProviderInstance } from '$lib/provider-instance'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { db } from '$db'
import { auditLog } from '$db/schema'

const KIND = t.Union([t.Literal('github'), t.Literal('gitlab'), t.Literal('gitea')])

const safeInstanceSchema = t.Object({
  id: t.String(),
  kind: KIND,
  displayName: t.String(),
  baseUrl: t.String(),
  clientId: t.String(),
  logoUrl: t.Nullable(t.String()),
  enabled: t.Boolean(),
  hasOAuthSecret: t.Boolean(),
  lastUsedAt: t.Nullable(t.Number()),
})

async function lastUsedFor(id: string): Promise<number | null> {
  const rows = await db
    .select({ createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(eq(auditLog.target, `provider_instance:${id}`))
    .orderBy(desc(auditLog.createdAt))
    .limit(1)
  return rows[0]?.createdAt ?? null
}

function toSafe(inst: ProviderInstance, lastUsedAt: number | null) {
  return {
    id: inst.id,
    kind: inst.kind,
    displayName: inst.displayName,
    baseUrl: inst.baseUrl,
    clientId: inst.clientId,
    logoUrl: inst.logoUrl,
    enabled: inst.enabled,
    hasOAuthSecret: Boolean(inst.clientSecret && inst.clientSecret.length > 0),
    lastUsedAt,
  }
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async ({ params, set }) => {
      const inst = getInstance(params.id)
      if (!inst) {
        set.status = 404
        return { error: 'Instance not found' }
      }
      return toSafe(inst, await lastUsedFor(inst.id))
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Get a single provider instance',
        operationId: 'getProviderInstance',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      response: {
        200: safeInstanceSchema,
        404: t.Object({ error: t.String() }),
      },
    },
  )
  .patch(
    '/',
    async ({ params, body, set, admin, request }) => {
      if (!getInstance(params.id)) {
        set.status = 404
        return { error: 'Instance not found' }
      }
      try {
        const inst = await updateInstance(params.id, body)
        if (!inst) {
          set.status = 404
          return { error: 'Instance not found' }
        }
        const { clientSecret: _omit, ...safeMeta } = body
        void _omit
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'provider.update',
          target: `provider:${params.id}`,
          meta: safeMeta as Record<string, unknown>,
        })
        return toSafe(inst, await lastUsedFor(inst.id))
      } catch (e) {
        set.status = 400
        return { error: e instanceof Error ? e.message : 'Failed to update instance' }
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Partially update a provider instance',
        operationId: 'patchProviderInstance',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        kind: t.Optional(KIND),
        displayName: t.Optional(t.String()),
        baseUrl: t.Optional(t.String()),
        clientId: t.Optional(t.String()),
        clientSecret: t.Optional(t.String()),
        logoUrl: t.Optional(t.Nullable(t.String())),
        enabled: t.Optional(t.Boolean()),
      }),
      response: {
        200: safeInstanceSchema,
        400: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
  )
  .delete(
    '/',
    async ({ params, set, admin, request }) => {
      if (!getInstance(params.id)) {
        set.status = 404
        return { error: 'Instance not found' }
      }
      await deleteInstance(params.id)
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'provider.delete',
        target: `provider:${params.id}`,
      })
      set.status = 204
      return null
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Delete a provider instance',
        operationId: 'deleteProviderInstance',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
    },
  )
