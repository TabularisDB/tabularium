import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getAppUrlSchemes, setAppUrlSchemes } from '$lib/app-schemes'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const appUrlSchemeSchema = t.Object({
  name: t.String({ minLength: 1 }),
  scheme: t.String({ pattern: '^[a-z][a-z0-9+.-]*$' }),
  kinds: t.Optional(t.Array(t.String({ minLength: 1 }))),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({ schemes: getAppUrlSchemes() }), {
    detail: {
      tags: ['Admin'],
      summary: 'List configured app URL schemes',
      operationId: 'listAppUrlSchemes',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({ schemes: t.Array(appUrlSchemeSchema) }),
    },
  })
  .put(
    '/',
    async ({ body, admin, request }) => {
      await setAppUrlSchemes(body.schemes)
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'registry.app_url_schemes.update',
        target: 'registry:app_url_schemes',
        meta: { count: body.schemes.length },
      })
      return { ok: true, schemes: getAppUrlSchemes() }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Replace the full list of app URL schemes',
        description:
          'Overwrites the stored app_url_schemes setting with the provided list. Each scheme needs a name + URL scheme (lowercase, starts with a letter). Optional `kinds` filter restricts the scheme to specific plugin kinds.',
        operationId: 'replaceAppUrlSchemes',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({ schemes: t.Array(appUrlSchemeSchema) }),
      response: {
        200: t.Object({ ok: t.Boolean(), schemes: t.Array(appUrlSchemeSchema) }),
      },
    },
  )
