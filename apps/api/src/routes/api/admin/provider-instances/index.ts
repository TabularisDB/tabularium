import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { listInstances, getInstance, createInstance, type ProviderInstance } from '$lib/provider-instance'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const KIND = t.Union([t.Literal('github'), t.Literal('gitlab'), t.Literal('gitea')])

const safeInstanceSchema = t.Object({
  id: t.String(),
  kind: KIND,
  displayName: t.String(),
  baseUrl: t.String(),
  clientId: t.String(),
  logoUrl: t.Nullable(t.String()),
  enabled: t.Boolean(),
})

function toSafe(inst: ProviderInstance) {
  return {
    id: inst.id,
    kind: inst.kind,
    displayName: inst.displayName,
    baseUrl: inst.baseUrl,
    clientId: inst.clientId,
    logoUrl: inst.logoUrl,
    enabled: inst.enabled,
  }
}

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({ instances: listInstances().map(toSafe) }), {
    detail: {
      tags: ['Admin'],
      summary: 'List all provider instances (secrets redacted)',
      operationId: 'listProviderInstances',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ instances: t.Array(safeInstanceSchema) }) },
  })
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
        return toSafe(inst)
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
