import { Elysia, t } from 'elysia'
import { getAppUrlSchemes } from '$lib/app-schemes'

const appUrlSchemeSchema = t.Object({
  name: t.String(),
  scheme: t.String(),
  kinds: t.Optional(t.Array(t.String())),
})

export default new Elysia().get(
  '/',
  () => ({
    appUrlSchemes: getAppUrlSchemes(),
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
      }),
    },
  },
)
