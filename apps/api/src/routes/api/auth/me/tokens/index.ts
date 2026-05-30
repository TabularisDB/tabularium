import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import {
  createPublisherToken,
  listPublisherTokens,
  PublisherTokenError,
  type PublisherTokenRow,
} from '$lib/publisher-tokens'
import { recordAudit } from '$lib/audit'
import { db } from '$db'

const tokenRowSchema = t.Object({
  id: t.String(),
  name: t.String(),
  prefix: t.String(),
  scopes: t.Array(t.String()),
  expiresAt: t.Nullable(t.Number()),
  lastUsedAt: t.Nullable(t.Number()),
  createdAt: t.Number(),
  revokedAt: t.Nullable(t.Number()),
})

function viewToResponse(row: PublisherTokenRow) {
  return row
}

export default new Elysia()
  .use(authMiddleware)
  .get('/', async ({ user }) => ({ tokens: (await listPublisherTokens(user.sub)).map(viewToResponse) }), {
    detail: {
      tags: ['Publisher tokens'],
      summary: "List the caller's publisher tokens",
      operationId: 'listMyPublisherTokens',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ tokens: t.Array(tokenRowSchema) }) },
  })
  .post(
    '/',
    async ({ body, set, user, request }) => {
      try {
        const created = await createPublisherToken({
          userId: user.sub,
          name: body.name,
          scopes: body.scopes,
          expiresAt: body.expiresAt,
        })
        const actor = await db.query.users.findFirst({ where: { id: user.sub }, columns: { displayName: true } })
        await recordAudit({
          actorId: user.sub,
          actorName: actor?.displayName ?? null,
          action: 'publisher_token.create',
          target: `publisher_token:${created.id}`,
          meta: { name: created.row.name, scopes: created.row.scopes, expiresAt: created.row.expiresAt },
          ip: request.headers.get('x-forwarded-for') ?? null,
        })
        return { token: created.token, row: viewToResponse(created.row) }
      } catch (err) {
        if (err instanceof PublisherTokenError) {
          set.status = 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Publisher tokens'],
        summary: 'Create a publisher API token',
        description:
          'Returns the plaintext token once. Store it immediately — the registry only persists ' +
          'a sha256 hash and cannot show the token again. Use it as `Authorization: Bearer <token>` ' +
          'against POST /api/publish/:slug.',
        operationId: 'createMyPublisherToken',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 80 }),
        scopes: t.Array(t.String({ minLength: 1, maxLength: 80 }), { minItems: 1, maxItems: 32 }),
        expiresAt: t.Optional(t.Nullable(t.Number())),
      }),
      response: {
        200: t.Object({ token: t.String(), row: tokenRowSchema }),
        400: t.Object({ error: t.String() }),
      },
    },
  )
