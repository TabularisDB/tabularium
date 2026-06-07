import { Elysia, t } from 'elysia'
import { CORE_REQUIRED_PLUGINS, listContributions, listRequiredPlugins } from '$lib/plugin-host'

const navEntrySchema = t.Object({
  id: t.String(),
  href: t.String(),
  labelKey: t.String(),
  icon: t.String(),
  order: t.Optional(t.Number()),
  pluginId: t.String(),
})

const pageRouteSchema = t.Object({
  path: t.String(),
  componentImport: t.String(),
  pluginId: t.String(),
})

const responseSchema = t.Object({
  points: t.Object({
    'admin-nav-entry': t.Array(navEntrySchema),
    'admin-page-route': t.Array(pageRouteSchema),
    'user-settings-nav-entry': t.Array(navEntrySchema),
    'user-page-route': t.Array(pageRouteSchema),
    'public-page-route': t.Array(pageRouteSchema),
  }),
  required: t.Object({
    all: t.Array(t.String()),
    core: t.Array(t.String()),
  }),
})

export default new Elysia().get(
  '/',
  () => {
    return {
      points: listContributions() as unknown as never,
      required: {
        all: listRequiredPlugins(),
        core: [...CORE_REQUIRED_PLUGINS],
      },
    }
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'List plugin contribution metadata + required plugin ids',
      operationId: 'getPluginContributions',
    },
    response: { 200: responseSchema },
  },
)
