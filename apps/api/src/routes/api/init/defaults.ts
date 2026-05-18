import { Elysia, t } from 'elysia'
import { env } from '$lib/env'
import { bootstrapAuthMiddleware } from '$middleware/bootstrap-auth'

export default new Elysia().use(bootstrapAuthMiddleware).get(
  '/',
  () => ({
    database: { url: env.DATABASE_URL ?? '' },
    baseUrl: env.BASE_URL,
    webBaseUrl: env.WEB_BASE_URL ?? null,
    providers: {
      github: { clientId: env.GITHUB_CLIENT_ID ?? '', clientSecretSet: Boolean(env.GITHUB_CLIENT_SECRET) },
      gitlab: { clientId: env.GITLAB_CLIENT_ID ?? '', clientSecretSet: Boolean(env.GITLAB_CLIENT_SECRET) },
      codeberg: { clientId: env.CODEBERG_CLIENT_ID ?? '', clientSecretSet: Boolean(env.CODEBERG_CLIENT_SECRET) },
    },
  }),
  {
    detail: { tags: ['Auth'], summary: 'Env values to prefill the install wizard', operationId: 'initDefaults' },
    response: {
      200: t.Object({
        database: t.Object({ url: t.String() }),
        baseUrl: t.String(),
        webBaseUrl: t.Union([t.String(), t.Null()]),
        providers: t.Object({
          github: t.Object({ clientId: t.String(), clientSecretSet: t.Boolean() }),
          gitlab: t.Object({ clientId: t.String(), clientSecretSet: t.Boolean() }),
          codeberg: t.Object({ clientId: t.String(), clientSecretSet: t.Boolean() }),
        }),
      }),
    },
  },
)
