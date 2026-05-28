import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { storage } from '$lib/storage'
import { setSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const ALLOWED_MIMES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
}

const MAX_BYTES = 256 * 1024

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ body, set, admin, request }) => {
    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file uploaded — multipart field name must be "file"' }
    }
    const ext = ALLOWED_MIMES[file.type]
    if (!ext) {
      set.status = 415
      return { error: `Unsupported type ${file.type}. Allowed: png, jpg, webp, svg, ico.` }
    }
    if (file.size > MAX_BYTES) {
      set.status = 413
      return { error: `File exceeds ${MAX_BYTES / 1024} KB cap` }
    }
    const bytes = await file.arrayBuffer()
    const key = `branding/favicon.${ext}`
    try {
      const { url } = await storage().put(key, bytes, file.type)
      const versioned = `${url}?v=${Date.now()}`
      await setSetting('branding.favicon_url', versioned)
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'branding.favicon_upload',
        target: 'branding',
        meta: { size: file.size, mime: file.type },
      })
      return { ok: true, faviconUrl: versioned }
    } catch (err) {
      set.status = 500
      return { error: err instanceof Error ? err.message : 'Upload failed' }
    }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Upload a branding favicon',
      description:
        'Multipart upload. Field name must be `file`. Accepts png/jpg/webp/svg/ico up to 256 KB. ' +
        'Storage backend is set in `/admin/infra/storage`. The branding `favicon_url` setting is updated to reference the new URL ' +
        '(includes a cache-buster query param).',
      operationId: 'uploadBrandingFavicon',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({ file: t.File() }),
    response: {
      200: t.Object({ ok: t.Boolean(), faviconUrl: t.String() }),
      400: t.Object({ error: t.String() }),
      413: t.Object({ error: t.String() }),
      415: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
    },
  },
)
