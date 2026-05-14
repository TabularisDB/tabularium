import { Elysia, t } from 'elysia'
import { getBranding } from '$lib/branding'

const brandingSchema = t.Object({
  name: t.String(),
  tagline: t.String(),
  primaryHex: t.String(),
  accentHex: t.String(),
  successHex: t.String(),
  logoUrl: t.Nullable(t.String()),
  faviconUrl: t.Nullable(t.String()),
  footerText: t.Nullable(t.String()),
  analyticsScript: t.Nullable(t.String()),
  allowIndexing: t.Boolean(),
})

export default new Elysia()
  .get('/', () => getBranding(), {
    detail: {
      tags: ['Plugins'],
      summary: 'Get instance branding (whitelabel)',
      description:
        'Public read-only endpoint. Frontend reads this at boot to render the custom name, tagline, brand colors, logo, footer text, and any analytics snippet.',
      operationId: 'getBranding',
    },
    response: { 200: brandingSchema },
  })
