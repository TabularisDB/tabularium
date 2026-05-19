import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { ensureSigningKey, getCurrentPublicJwk, getPreviousPublicJwk, rotateSigningKey } from '$lib/registry-key'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const PublicJwkSchema = t.Object({
  kty: t.Literal('OKP'),
  crv: t.Literal('Ed25519'),
  x: t.String(),
  use: t.Literal('sig'),
  alg: t.Literal('EdDSA'),
  kid: t.String(),
  created_at: t.Optional(t.Number()),
  rotated_at: t.Optional(t.Number()),
})

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async () => {
      await ensureSigningKey()
      return {
        current: await getCurrentPublicJwk(),
        previous: await getPreviousPublicJwk(),
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Get current + previous registry signing keys',
        operationId: 'getInstanceSecurity',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: t.Object({
          current: PublicJwkSchema,
          previous: t.Nullable(PublicJwkSchema),
        }),
      },
    },
  )
  .post(
    '/rotate',
    async ({ admin, request }) => {
      const { oldKid, newKid } = await rotateSigningKey()
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'registry.signing_key.rotate',
        target: 'registry:signing_key',
        meta: { oldKid, newKid },
      })
      return { ok: true, oldKid, newKid }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Rotate the registry signing key',
        description:
          'Generates a new Ed25519 keypair, demotes the current key to .previous (overwriting any earlier previous), and records an audit entry.',
        operationId: 'rotateInstanceSigningKey',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: t.Object({ ok: t.Boolean(), oldKid: t.String(), newKid: t.String() }),
      },
    },
  )
