import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { setSetting } from '$lib/settings'
import { getI18nConfig, SUPPORTED_LOCALES, type Locale } from '$lib/i18n'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const localeSchema = t.Union([
  t.Literal('en'),
  t.Literal('de'),
  t.Literal('es'),
  t.Literal('fr'),
  t.Literal('it'),
  t.Literal('zh-CN'),
])

const i18nResponse = t.Object({
  defaultLocale: localeSchema,
  enabledLocales: t.Array(localeSchema),
  availableLocales: t.Array(localeSchema),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => getI18nConfig(), {
    detail: { tags: ['Admin'], summary: 'Get i18n config', operationId: 'adminGetI18n', security: [{ bearerAuth: [] }, { cookieAuth: [] }] },
    response: { 200: i18nResponse },
  })
  .patch(
    '/',
    async ({ body, admin, request, set }) => {
      const enabled = (body.enabledLocales ?? getI18nConfig().enabledLocales) as Locale[]
      if (enabled.length === 0) {
        set.status = 400
        return { error: 'At least one locale must be enabled.' }
      }
      const desiredDefault = (body.defaultLocale ?? getI18nConfig().defaultLocale) as Locale
      if (!enabled.includes(desiredDefault)) {
        set.status = 400
        return { error: `Default locale '${desiredDefault}' is not in enabled locales.` }
      }
      const seen = new Set<string>()
      const uniqueEnabled = enabled.filter((l) => {
        if (!SUPPORTED_LOCALES.includes(l) || seen.has(l)) return false
        seen.add(l)
        return true
      })
      await setSetting('i18n.enabled_locales', JSON.stringify(uniqueEnabled))
      await setSetting('i18n.default_locale', desiredDefault)
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'i18n.update',
        target: 'i18n',
        meta: { defaultLocale: desiredDefault, enabledLocales: uniqueEnabled },
      })
      return getI18nConfig()
    },
    {
      detail: { tags: ['Admin'], summary: 'Update i18n config', operationId: 'adminUpdateI18n', security: [{ bearerAuth: [] }, { cookieAuth: [] }] },
      body: t.Object({
        defaultLocale: t.Optional(localeSchema),
        enabledLocales: t.Optional(t.Array(localeSchema)),
      }),
      response: {
        200: i18nResponse,
        400: t.Object({ error: t.String() }),
      },
    },
  )
