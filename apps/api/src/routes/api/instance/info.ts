import { Elysia, t } from 'elysia'
import { getAppUrlSchemes } from '$lib/app-schemes'
import { getSetting } from '$lib/settings'

const appUrlSchemeSchema = t.Object({
  name: t.String(),
  scheme: t.String(),
  kinds: t.Optional(t.Array(t.String())),
})

export default new Elysia().get(
  '/',
  () => ({
    appUrlSchemes: getAppUrlSchemes(),
    // When set, the frontend links "Docs" here (e.g. the product website)
    // instead of the built-in /docs pages.
    docsExternalUrl: getSetting('docs.external_url') ?? null,
  }),
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Public instance info (app URL schemes, etc)',
      description:
        'Public read-only endpoint. Clients (frontend, third-party browsers) consume this on boot to learn which desktop apps can handle "Open in App" deep-links for plugin installation.',
      operationId: 'getInstanceInfo',
    },
    response: {
      200: t.Object({
        appUrlSchemes: t.Array(appUrlSchemeSchema),
        docsExternalUrl: t.Nullable(t.String()),
      }),
    },
  },
)
