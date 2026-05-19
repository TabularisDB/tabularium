import { Elysia, t } from 'elysia'
import { listEnabledInstances } from '$lib/provider-instance'

const providerSchema = t.Object({
  id: t.String(),
  kind: t.Union([t.Literal('github'), t.Literal('gitlab'), t.Literal('gitea')]),
  displayName: t.String(),
  baseUrl: t.String(),
  logoUrl: t.Nullable(t.String()),
})

export default new Elysia().get(
  '/',
  () => {
    const instances = listEnabledInstances()
    return {
      providers: instances.map((i) => ({
        id: i.id,
        kind: i.kind,
        displayName: i.displayName,
        baseUrl: i.baseUrl,
        logoUrl: i.logoUrl,
      })),
    }
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'List enabled OAuth provider instances',
      operationId: 'listProviders',
    },
    response: { 200: t.Object({ providers: t.Array(providerSchema) }) },
  },
)
