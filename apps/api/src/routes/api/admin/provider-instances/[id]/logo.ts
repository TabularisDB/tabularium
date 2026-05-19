import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getInstance, updateInstance } from '$lib/provider-instance'
import { storage } from '$lib/storage'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const ALLOWED_MIMES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const MAX_BYTES = 512 * 1024

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, body, set, admin, request }) => {
    const inst = getInstance(params.id)
    if (!inst) {
      set.status = 404
      return { error: 'Instance not found' }
    }
    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file uploaded — multipart field name must be "file"' }
    }
    const ext = ALLOWED_MIMES[file.type]
    if (!ext) {
      set.status = 415
      return { error: `Unsupported type ${file.type}. Allowed: png, jpg, webp, svg.` }
    }
    if (file.size > MAX_BYTES) {
      set.status = 413
      return { error: `File exceeds ${MAX_BYTES / 1024} KB cap` }
    }
    const bytes = await file.arrayBuffer()
    const key = `provider-logos/${params.id}.${ext}?v=${Date.now()}`.replace(/\?.*$/, '')
    const versioned = `${key}?v=${Date.now()}`
    try {
      const { url } = await storage().put(key, bytes, file.type)
      const updated = await updateInstance(params.id, { logoUrl: `${url}?v=${Date.now()}` })
      if (!updated) {
        set.status = 404
        return { error: 'Instance disappeared mid-upload' }
      }
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'provider.logo_upload',
        target: `provider:${params.id}`,
        meta: { size: file.size, mime: file.type },
      })
      return { ok: true, logoUrl: updated.logoUrl, storedAt: versioned }
    } catch (err) {
      set.status = 500
      return { error: err instanceof Error ? err.message : 'Upload failed' }
    }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Upload a logo for a provider instance',
      description:
        'Multipart upload. Field name must be `file`. Accepts png/jpg/webp/svg up to 512 KB. ' +
        'Storage backend is set in `/admin/infra/storage`. The instance row is updated to reference the new URL ' +
        '(includes a cache-buster query param).',
      operationId: 'uploadProviderLogo',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    body: t.Object({ file: t.File() }),
    response: {
      200: t.Object({ ok: t.Boolean(), logoUrl: t.Nullable(t.String()), storedAt: t.String() }),
      400: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      413: t.Object({ error: t.String() }),
      415: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
    },
  },
)
