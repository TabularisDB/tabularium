import { Elysia, t } from 'elysia'
import { bootstrapAuthMiddleware } from '$middleware/bootstrap-auth'
import { probeDatabase } from '$lib/db-probe'

export default new Elysia().use(bootstrapAuthMiddleware).post(
  '/',
  async ({ body }) => {
    const result = await probeDatabase(body.url)
    return result
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'Probe a database URL during install',
      description:
        'Tries to connect to the given URL and run SELECT 1. Reports the detected dialect either way. Bootstrap-only.',
      operationId: 'initTestDb',
    },
    body: t.Object({
      url: t.String({ minLength: 1 }),
    }),
    response: {
      200: t.Union([
        t.Object({
          ok: t.Literal(true),
          dialect: t.Union([t.Literal('sqlite'), t.Literal('pg'), t.Literal('mysql')]),
        }),
        t.Object({
          ok: t.Literal(false),
          dialect: t.Union([t.Literal('sqlite'), t.Literal('pg'), t.Literal('mysql')]),
          error: t.String(),
        }),
      ]),
      401: t.Object({ error: t.String() }),
    },
  },
)
