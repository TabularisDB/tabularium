import { Elysia, t } from 'elysia'
import { db } from '$db'
import { verifyUnsubscribeToken } from '$lib/email/unsubscribe-token'
import { loadPreferences, savePreferences, unsubscribeAllOptIn } from '$lib/email/preferences'

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at <= 1) return email
  return email.slice(0, 1) + '***' + email.slice(at)
}

const bucket = t.Union([t.Literal('instant'), t.Literal('daily'), t.Literal('weekly'), t.Literal('off')])
const prefsSchema = t.Record(t.String(), bucket)

const responseSchema = t.Object({
  email: t.Union([t.String(), t.Null()]),
  prefs: prefsSchema,
  categories: t.Array(t.Object({ key: t.String(), optIn: t.Boolean() })),
})

const CATEGORIES = [
  { key: 'account', optIn: false },
  { key: 'owner_ops', optIn: true },
  { key: 'plugin_updates', optIn: true },
  { key: 'newsletter', optIn: true },
]

export default new Elysia()
  .get(
    '/',
    async ({ params, set }) => {
      const v = await verifyUnsubscribeToken(params.token)
      if (!v) {
        set.status = 401
        return { error: 'Invalid or expired link' } as never
      }
      const userRow = await db.query.users.findFirst({ where: { id: v.userId } })
      const prefs = await loadPreferences(v.userId)
      return { email: maskEmail(userRow?.email ?? null), prefs, categories: CATEGORIES }
    },
    {
      detail: {
        tags: ['Email'],
        summary: 'Read preferences (token-authenticated)',
        operationId: 'getPreferencesByToken',
      },
      params: t.Object({ token: t.String() }),
      response: { 200: responseSchema, 401: t.Object({ error: t.String() }) },
    },
  )
  .put(
    '/',
    async ({ params, body, set }) => {
      const v = await verifyUnsubscribeToken(params.token)
      if (!v) {
        set.status = 401
        return { error: 'Invalid or expired link' } as never
      }
      const next = await savePreferences(v.userId, body.prefs as Record<string, never>)
      return { ok: true, prefs: next }
    },
    {
      detail: {
        tags: ['Email'],
        summary: 'Update preferences (token-authenticated)',
        operationId: 'putPreferencesByToken',
      },
      params: t.Object({ token: t.String() }),
      body: t.Object({ prefs: prefsSchema }),
      response: {
        200: t.Object({ ok: t.Boolean(), prefs: prefsSchema }),
        401: t.Object({ error: t.String() }),
      },
    },
  )
  .post(
    '/',
    async ({ params, body, set }) => {
      const v = await verifyUnsubscribeToken(params.token)
      if (!v) {
        set.status = 401
        return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }
      // RFC 8058: the one-click request body is form-encoded
      // `List-Unsubscribe=One-Click`. With `parse: 'text'` we receive the raw
      // string; some clients may also POST a parsed form object — accept both.
      const isOneClick =
        (typeof body === 'string' && body.includes('List-Unsubscribe=One-Click')) ||
        (typeof body === 'object' &&
          body !== null &&
          (body as Record<string, string>)['List-Unsubscribe'] === 'One-Click')
      if (!isOneClick) {
        set.status = 400
        return new Response(JSON.stringify({ error: 'Expected RFC 8058 one-click body' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      await unsubscribeAllOptIn(v.userId)
      return new Response('Unsubscribed', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    },
    {
      detail: {
        tags: ['Email'],
        summary: 'One-click unsubscribe (RFC 8058)',
        operationId: 'oneClickUnsubscribe',
      },
      params: t.Object({ token: t.String() }),
      parse: 'text',
    },
  )
