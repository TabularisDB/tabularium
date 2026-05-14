import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { listSettings } from '$lib/settings'

const settingEntrySchema = t.Object({
  key: t.String(),
  value: t.Nullable(t.String()),
  encrypted: t.Boolean(),
  updatedAt: t.Number(),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', async () => ({ settings: await listSettings() }), {
    detail: {
      tags: ['Admin'],
      summary: 'List all settings (encrypted values masked)',
      operationId: 'listSettings',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ settings: t.Array(settingEntrySchema) }) },
  })
