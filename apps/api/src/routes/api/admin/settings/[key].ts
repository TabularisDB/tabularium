import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getSetting, hasSetting, setSetting, deleteSetting } from '$lib/settings'

// Keys that should be stored encrypted (admin-managed secrets).
const ENCRYPTED_KEY_PATTERNS: RegExp[] = [
  /\.client_secret$/,
  /\.password$/,
  /\.token$/,
  /\.redis_url$/,
  /\.s3_access_key$/,
  /\.s3_secret_key$/,
]

function isEncryptedKey(key: string): boolean {
  return ENCRYPTED_KEY_PATTERNS.some((re) => re.test(key))
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    ({ params, set }) => {
      if (!hasSetting(params.key)) {
        set.status = 404
        return { error: 'Setting not found' }
      }
      if (isEncryptedKey(params.key)) {
        // Never expose decrypted secret via this endpoint.
        return { key: params.key, value: null, encrypted: true }
      }
      return { key: params.key, value: getSetting(params.key) ?? null, encrypted: false }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Get a single setting (secrets redacted)',
        operationId: 'getSetting',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ key: t.String() }),
      response: {
        200: t.Object({ key: t.String(), value: t.Nullable(t.String()), encrypted: t.Boolean() }),
        404: t.Object({ error: t.String() }),
      },
    },
  )
  .put(
    '/',
    async ({ params, body }) => {
      await setSetting(params.key, body.value, { encrypted: isEncryptedKey(params.key) })
      return { ok: true }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Create or update a setting',
        description: 'Keys ending in `.client_secret`, `.password`, or `.token` are stored encrypted automatically.',
        operationId: 'putSetting',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ key: t.String() }),
      body: t.Object({ value: t.String() }),
      response: { 200: t.Object({ ok: t.Boolean() }) },
    },
  )
  .delete(
    '/',
    async ({ params, set }) => {
      if (!hasSetting(params.key)) {
        set.status = 404
        return { error: 'Setting not found' }
      }
      await deleteSetting(params.key)
      set.status = 204
      return null
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Delete a setting',
        operationId: 'deleteSetting',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ key: t.String() }),
    },
  )
