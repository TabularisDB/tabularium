import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { createAdminToken, listAdminTokens, AdminTokenError, type AdminTokenRow } from '$lib/admin-tokens'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const tokenRowSchema = t.Object({
  id: t.String(),
  name: t.String(),
  prefix: t.String(),
  scopes: t.Nullable(t.Array(t.String())),
  expiresAt: t.Nullable(t.Number()),
  lastUsedAt: t.Nullable(t.Number()),
  createdAt: t.Number(),
  revokedAt: t.Nullable(t.Number()),
})

function viewToResponse(row: AdminTokenRow) {
  return row
}

export default new Elysia()
  .use(adminMiddleware)
  .get('/', async ({ admin }) => ({ tokens: (await listAdminTokens(admin.id)).map(viewToResponse) }), {
    detail: {
      tags: ['Admin'],
      summary: 'List the caller’s admin API tokens',
      operationId: 'listAdminTokens',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ tokens: t.Array(tokenRowSchema) }) },
  })
  .post(
    '/',
    async ({ body, set, admin, request }) => {
      try {
        const created = await createAdminToken({
          userId: admin.id,
          name: body.name,
          scopes: body.scopes,
          expiresAt: body.expiresAt,
        })
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'admin_token.create',
          target: `admin_token:${created.id}`,
          meta: { name: created.row.name, scopes: created.row.scopes, expiresAt: created.row.expiresAt },
        })
        // The plaintext token is returned ONCE here. The client is expected
        // to copy it; we have no way to recover it later (only the sha256
        // hash is persisted).
        return { token: created.token, row: viewToResponse(created.row) }
      } catch (err) {
        if (err instanceof AdminTokenError) {
          set.status = 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Create a long-lived admin API token (M2M)',
        description:
          'Returns the plaintext token once. Store it immediately — the registry only persists ' +
          'a sha256 hash and cannot show the token again. Use it as `Authorization: Bearer <token>` ' +
          'against any /api/admin/* endpoint.',
        operationId: 'createAdminToken',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 80 }),
        scopes: t.Optional(t.Nullable(t.Array(t.String({ minLength: 1, maxLength: 40 }), { maxItems: 16 }))),
        expiresAt: t.Optional(t.Nullable(t.Number())),
      }),
      response: {
        200: t.Object({ token: t.String(), row: tokenRowSchema }),
        400: t.Object({ error: t.String() }),
      },
    },
  )
