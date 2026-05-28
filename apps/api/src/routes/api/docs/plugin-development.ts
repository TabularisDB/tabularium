import { Elysia, t } from 'elysia'
import { buildPluginDocs } from '$lib/plugin-docs'
import { SUPPORTED_LOCALES, getI18nConfig, type Locale } from '$lib/i18n'

export default new Elysia().get(
  '/',
  async ({ query, set }) => {
    const fallback = getI18nConfig().defaultLocale
    const locale: Locale =
      typeof query.locale === 'string' && SUPPORTED_LOCALES.includes(query.locale as Locale)
        ? (query.locale as Locale)
        : fallback
    set.headers['cache-control'] = 'no-store'
    return await buildPluginDocs({ locale })
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Plugin developer docs (live, localized)',
      description:
        'Returns a structured PluginDocs document with the current core schema, ' +
        'global extensions, per-kind extensions, examples (YAML + JSON), and links ' +
        'to the OpenAPI spec. Generated on every request from the live registry state.',
      operationId: 'getPluginDocs',
    },
    query: t.Object({ locale: t.Optional(t.String({ maxLength: 16 })) }),
  },
)
