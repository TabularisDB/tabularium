import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { loadPreferences, savePreferences } from '$lib/email/preferences'

const bucket = t.Union([t.Literal('instant'), t.Literal('daily'), t.Literal('weekly'), t.Literal('off')])
const prefsSchema = t.Record(t.String(), bucket)

export default new Elysia()
  .use(authMiddleware)
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
