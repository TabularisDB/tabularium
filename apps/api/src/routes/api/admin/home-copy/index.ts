import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getHomeCopy, setHomeCopy, HomeCopyValidationError } from '$lib/home-copy'
import { recordAudit, actorFromAdmin } from '$lib/audit'

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

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => getHomeCopy(), {
    detail: {
      tags: ['Admin'],
      summary: 'Get home-page copy overrides (admin view)',
      operationId: 'adminGetHomeCopy',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: homeCopySchema },
  })
  .put(
    '/',
    async ({ body, admin, request, set }) => {
      try {
        const saved = await setHomeCopy(body)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'home_copy.update',
          target: 'home_copy',
          meta: {
            eyebrowEnabled: saved.eyebrow.enabled,
            featuresEnabled: saved.features.enabled,
          },
        })
        return saved
      } catch (e) {
        if (e instanceof HomeCopyValidationError) {
          set.status = 400
          return { error: e.message }
        }
        throw e
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Update home-page copy overrides',
        description: 'Replaces the entire home_copy blob. Empty strings clear the override for that locale.',
        operationId: 'adminUpdateHomeCopy',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: homeCopySchema,
      response: {
        200: homeCopySchema,
        400: t.Object({ error: t.String() }),
      },
    },
  )
