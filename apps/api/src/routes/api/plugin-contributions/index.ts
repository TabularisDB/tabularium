import { Elysia, t } from 'elysia'
import {
  CORE_REQUIRED_PLUGINS,
  listContributions,
  listEnabledPlugins,
  listRequiredPlugins,
} from '$lib/plugin-host'

// Nav entries form a tree: parents may have inline `children`, or external
// plugin entries may attach via `parent`. TypeBox needs `t.Recursive` to model
// the nested shape on the wire.
const navEntrySchema = t.Recursive((self) =>
  t.Object({
    id: t.String(),
    href: t.Optional(t.String()),
    labelKey: t.String(),
    icon: t.String(),
    order: t.Optional(t.Number()),
    parent: t.Optional(t.String()),
    children: t.Optional(t.Array(self)),
    pluginId: t.String(),
  }),
)

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

// Plugin-host kernel can't yet runtime-unmount routes/handlers when an
// operator flips `infra.plugins.enabled`. Until that lands, the next-best
// thing is to hide contributions of currently-disabled plugins from this
// endpoint — the admin sidenav, route-shim resolver, and settings page all
// read from here, so soft-disabling at serialization time gives instant
// UI feedback (the api routes themselves still respond until next restart).
function isVisible(pluginId: string, enabled: Set<string>, required: Set<string>): boolean {
  return enabled.has(pluginId) || required.has(pluginId)
}

export default new Elysia().get(
  '/',
  () => {
    const enabled = new Set(listEnabledPlugins())
    const required = new Set(listRequiredPlugins())
    const raw = listContributions() as Record<string, Array<{ pluginId: string }>>
    const points = Object.fromEntries(
      Object.entries(raw).map(([k, arr]) => [k, arr.filter((e) => isVisible(e.pluginId, enabled, required))]),
    ) as Record<string, Array<{ pluginId: string }>>
    return {
      points: points as unknown as never,
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
