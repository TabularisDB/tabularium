import { Elysia, t } from 'elysia'
import { getI18nConfig } from '$lib/i18n'

const localeSchema = t.Union([
  t.Literal('en'),
  t.Literal('de'),
  t.Literal('es'),
  t.Literal('fr'),
  t.Literal('it'),
  t.Literal('zh-CN'),
])

export default new Elysia()
  .get('/', () => getI18nConfig(), {
    detail: {
      tags: ['Plugins'],
      summary: 'Get i18n config (default + enabled locales)',
      operationId: 'getI18nConfig',
    },
    response: {
      200: t.Object({
        defaultLocale: localeSchema,
        enabledLocales: t.Array(localeSchema),
        availableLocales: t.Array(localeSchema),
      }),
    },
  })
