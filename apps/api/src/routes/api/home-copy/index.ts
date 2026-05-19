import { Elysia, t } from 'elysia'
import { getHomeCopy } from '$lib/home-copy'

const translationsSchema = t.Object({
  en: t.Optional(t.String()),
  de: t.Optional(t.String()),
  es: t.Optional(t.String()),
  fr: t.Optional(t.String()),
  it: t.Optional(t.String()),
  'zh-CN': t.Optional(t.String()),
})

const pairSchema = t.Object({ title: translationsSchema, body: translationsSchema })

const homeCopySchema = t.Object({
  eyebrow: t.Object({ enabled: t.Boolean(), text: translationsSchema }),
  features: t.Object({
    enabled: t.Boolean(),
    dropin: pairSchema,
    providers: pairSchema,
    release: pairSchema,
  }),
})

export default new Elysia().get('/', () => getHomeCopy(), {
  detail: {
    tags: ['Plugins'],
    summary: 'Get home-page copy overrides',
    description:
      'Public read-only endpoint. Returns the admin-configured eyebrow + feature-section overrides. Empty translation maps mean "fall back to the built-in copy".',
    operationId: 'getHomeCopy',
  },
  response: { 200: homeCopySchema },
})
