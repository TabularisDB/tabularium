import { Elysia, t } from 'elysia'
import { adminMw, host } from '../host-handles'
import { buildTurboProvider } from '../provider'

const OkSchema = t.Object({
  ok: t.Boolean(),
  reason: t.Optional(t.String()),
  /** Echoed back so the UI can confirm which region the live config targets. */
  region: t.Optional(t.Union([t.Literal('global'), t.Literal('eu')])),
})

const ErrorSchema = t.Object({ error: t.String() })

export default function buildTestConnectionRoute() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Elysia().use(adminMw() as any).post(
    '/',
    async ({ set }) => {
      const provider = await buildTurboProvider(host())
      if (!provider) {
        set.status = 412
        return { error: 'TurboSMTP not fully configured — api key, consumer key, and consumer secret are required' }
      }
      const verifyAuth = provider.verifyAuth
      if (!verifyAuth) {
        // Defensive — every provider in our codebase ships verifyAuth, but the
        // EmailProvider interface marks it optional.
        return { ok: true, reason: 'verifyAuth not implemented; nothing to check' }
      }
      const result = await verifyAuth()
      const region = host().settings.get('email.turbo.region') === 'eu' ? 'eu' : 'global'
      if (result.ok) return { ok: true, region }
      return { ok: false, reason: result.reason ?? 'unknown', region }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'TurboSMTP — verify current credentials with a cheap round-trip',
        operationId: 'testTurbosmtpConnection',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: OkSchema,
        412: ErrorSchema,
      },
    },
  )
}
