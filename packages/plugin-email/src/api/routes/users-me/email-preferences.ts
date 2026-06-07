import { Elysia, t } from 'elysia'
import { host } from '../../host-handles'
import { loadPreferences, savePreferences } from '../../preferences'

const bucket = t.Union([t.Literal('instant'), t.Literal('daily'), t.Literal('weekly'), t.Literal('off')])
const prefsSchema = t.Record(t.String(), bucket)

type AuthCtxBase = {
  user: { sub: string; username?: string; jti?: string; bootstrap?: boolean }
}

export default function buildEmailPreferencesRoute() {
  const base = new Elysia() as Elysia<
    '',
    { decorator: AuthCtxBase; store: {}; derive: AuthCtxBase; resolve: {} }
  >
  return base
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .use(host().middleware.auth as any)
    .get(
      '/',
      async ({ user }) => {
        const prefs = await loadPreferences(user.sub)
        return { prefs }
      },
      {
        detail: {
          tags: ['Account'],
          summary: 'Get your email preferences',
          operationId: 'getMyEmailPreferences',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        },
        response: { 200: t.Object({ prefs: prefsSchema }) },
      },
    )
    .put(
      '/',
      async ({ user, body }) => {
        const next = await savePreferences(user.sub, body.prefs as Record<string, never>)
        return { ok: true, prefs: next }
      },
      {
        detail: {
          tags: ['Account'],
          summary: 'Update your email preferences',
          operationId: 'putMyEmailPreferences',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        },
        body: t.Object({ prefs: prefsSchema }),
        response: { 200: t.Object({ ok: t.Boolean(), prefs: prefsSchema }) },
      },
    )
}
