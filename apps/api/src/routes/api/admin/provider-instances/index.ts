import { Elysia, t } from 'elysia'
import { desc, inArray } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { listInstances, getInstance, createInstance, type ProviderInstance } from '$lib/provider-instance'
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

/**
 * Pull the most recent `provider_instance.oauth_callback` timestamp for every
 * provider id in one query, then return them keyed by id. Callers can look up
 * a provider's last-traffic signal without an N+1.
 */
async function loadLastUsedMap(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const targets = ids.map((id) => `provider_instance:${id}`)
  const rows = await db
    .select({ target: auditLog.target, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(inArray(auditLog.target, targets))
    .orderBy(desc(auditLog.createdAt))
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!r.target) continue
    const id = r.target.startsWith('provider_instance:') ? r.target.slice('provider_instance:'.length) : null
    if (!id || out.has(id)) continue
    out.set(id, r.createdAt)
  }
  return out
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async () => {
      const all = listInstances()
      const lastUsed = await loadLastUsedMap(all.map((i) => i.id))
      return { instances: all.map((inst) => toSafe(inst, lastUsed.get(inst.id) ?? null)) }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'List all provider instances (secrets redacted)',
        operationId: 'listProviderInstances',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: { 200: t.Object({ instances: t.Array(safeInstanceSchema) }) },
    },
  )
  .post(
    '/',
    async ({ body, set, admin, request }) => {
      if (getInstance(body.id)) {
        set.status = 409
        return { error: `Instance '${body.id}' already exists` }
      }
      try {
        const inst = await createInstance(body)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'provider.create',
          target: `provider:${inst.id}`,
          meta: { kind: inst.kind, displayName: inst.displayName, baseUrl: inst.baseUrl },
        })
        set.status = 201
        return toSafe(inst, null)
      } catch (e) {
        set.status = 400
        return { error: e instanceof Error ? e.message : 'Failed to create instance' }
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Create a new provider instance',
        operationId: 'createProviderInstance',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        id: t.String({ minLength: 1, maxLength: 64 }),
        kind: KIND,
        displayName: t.String({ minLength: 1, maxLength: 80 }),
        baseUrl: t.String({ minLength: 1 }),
        clientId: t.String({ minLength: 1 }),
        clientSecret: t.String({ minLength: 1 }),
        logoUrl: t.Optional(t.Nullable(t.String())),
        enabled: t.Optional(t.Boolean()),
      }),
      response: {
        201: safeInstanceSchema,
        400: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
    },
  )
