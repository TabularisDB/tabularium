import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import {
  CORE_REQUIRED_PLUGINS,
  ensureInstalled,
  getPluginStoredMeta,
  listContributions,
  listEnabledPlugins,
  listInstalled,
  listKnownPluginIds,
  listLoadedPlugins,
  listPluginStoredMetas,
  listRequiredPlugins,
  probeAvailable,
  readPluginReadme,
} from '$lib/plugin-host'
import { getSetting, setSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const SourceSchema = t.Union([t.Literal('workspace'), t.Literal('bundled'), t.Literal('registry')])

const NavEntrySchema = t.Object({
  id: t.String(),
  href: t.String(),
  labelKey: t.String(),
  icon: t.String(),
  order: t.Optional(t.Number()),
  pluginId: t.Optional(t.String()),
})

const PageRouteSchema = t.Object({
  path: t.String(),
  componentImport: t.String(),
  pluginId: t.Optional(t.String()),
})

const ContributionBundleSchema = t.Object({
  adminNav: t.Array(NavEntrySchema),
  userNav: t.Array(NavEntrySchema),
  adminRoutes: t.Array(PageRouteSchema),
  userRoutes: t.Array(PageRouteSchema),
  publicRoutes: t.Array(PageRouteSchema),
})

const PluginRowSchema = t.Object({
  id: t.String(),
  version: t.String(),
  source: SourceSchema,
  entryPoint: t.String(),
  installedAt: t.Number(),
  loaded: t.Boolean(),
  enabled: t.Boolean(),
  required: t.Boolean(),
  contributionsCount: t.Number(),
  contributions: ContributionBundleSchema,
  // Empty when the plugin isn't loaded (meta only captured at load time).
  requires: t.Array(t.String()),
  // Reverse edges: who declared `requires: [thisId]`. Computed across the
  // loaded plugin set.
  requiredBy: t.Array(t.String()),
  // package.json description (one-liner) — used as the modal subtitle.
  description: t.Nullable(t.String()),
  // Localized README (markdown) from `<pkgDir>/docs/README.<locale>.md`,
  // falling back to en. Plugins ship this so operators see what / how / why
  // the plugin does what it does before clicking around blindly.
  readme: t.Nullable(t.String()),
})

const AvailablePluginSchema = t.Object({
  id: t.String(),
  version: t.Nullable(t.String()),
  source: t.Nullable(t.Union([t.Literal('workspace'), t.Literal('bundled')])),
  description: t.Nullable(t.String()),
})

const ResponseSchema = t.Object({
  installed: t.Array(PluginRowSchema),
  enabled: t.Array(t.String()),
  required: t.Object({
    all: t.Array(t.String()),
    core: t.Array(t.String()),
  }),
  knownIds: t.Array(t.String()),
  loaded: t.Array(t.String()),
  // Plugins the shipped-set (workspace + bundled) knows about but that haven't
  // been installed yet. Probed once per request — there are <10 of these.
  available: t.Array(AvailablePluginSchema),
})

const ENABLED_SETTING_KEY = 'infra.plugins.enabled'

type TaggedNav = {
  id: string
  href: string
  labelKey: string
  icon: string
  order?: number
  pluginId?: string
}
type TaggedRoute = { path: string; componentImport: string; pluginId?: string }

type ContribBundle = {
  adminNav: TaggedNav[]
  userNav: TaggedNav[]
  adminRoutes: TaggedRoute[]
  userRoutes: TaggedRoute[]
  publicRoutes: TaggedRoute[]
}

function buildContributionMap() {
  const all = listContributions() as Record<string, Array<{ pluginId?: string }>>
  const byPlugin = new Map<string, ContribBundle>()
  function bucket(id: string): ContribBundle {
    let b = byPlugin.get(id)
    if (!b) {
      b = emptyBundle()
      byPlugin.set(id, b)
    }
    return b
  }
  for (const entry of all['admin-nav-entry'] ?? [])
    if (entry.pluginId) bucket(entry.pluginId).adminNav.push(entry as TaggedNav)
  for (const entry of all['user-settings-nav-entry'] ?? [])
    if (entry.pluginId) bucket(entry.pluginId).userNav.push(entry as TaggedNav)
  for (const entry of all['admin-page-route'] ?? [])
    if (entry.pluginId) bucket(entry.pluginId).adminRoutes.push(entry as TaggedRoute)
  for (const entry of all['user-page-route'] ?? [])
    if (entry.pluginId) bucket(entry.pluginId).userRoutes.push(entry as TaggedRoute)
  for (const entry of all['public-page-route'] ?? [])
    if (entry.pluginId) bucket(entry.pluginId).publicRoutes.push(entry as TaggedRoute)
  return byPlugin
}

function emptyBundle(): ContribBundle {
  return { adminNav: [], userNav: [], adminRoutes: [], userRoutes: [], publicRoutes: [] }
}

function readEnabledList(): string[] {
  const raw = getSetting(ENABLED_SETTING_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed
  } catch {
    // fall through
  }
  return []
}

async function writeEnabledList(list: string[]): Promise<void> {
  // Stable order so audit diffs read predictably.
  const dedup = [...new Set(list)].sort()
  await setSetting(ENABLED_SETTING_KEY, JSON.stringify(dedup))
}

// Cheap allow-list match: keep the locale param to BCP-47-ish ids the inlang
// project actually ships, so an attacker can't smuggle path components like
// `../` into the README probe.
const SUPPORTED_LOCALES = new Set(['en', 'de', 'es', 'fr', 'it', 'zh-CN'])
function sanitizeLocale(raw: string | undefined): string {
  if (!raw) return 'en'
  return SUPPORTED_LOCALES.has(raw) ? raw : 'en'
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    ({ query }) => {
      const locale = sanitizeLocale(query.locale)
      const installed = listInstalled()
      const loaded = new Set(listLoadedPlugins())
      const enabled = listEnabledPlugins()
      const enabledSet = new Set(enabled)
      const required = listRequiredPlugins()
      const requiredSet = new Set(required)
      const contribMap = buildContributionMap()

      // Build reverse-edge map: for each (loaded) plugin, who lists it under
      // requires? Iterating once costs less than per-row scans.
      const requiredByMap = new Map<string, string[]>()
      for (const meta of listPluginStoredMetas()) {
        for (const dep of meta.requires) {
          const list = requiredByMap.get(dep) ?? []
          list.push(meta.id)
          requiredByMap.set(dep, list)
        }
      }

      return {
        installed: installed
          .map((p) => {
            const c = contribMap.get(p.id) ?? emptyBundle()
            const count =
              c.adminNav.length +
              c.userNav.length +
              c.adminRoutes.length +
              c.userRoutes.length +
              c.publicRoutes.length
            const storedMeta = getPluginStoredMeta(p.id)
            const probe = probeAvailable(p.id)
            return {
              id: p.id,
              version: p.version,
              source: p.source,
              entryPoint: p.entryPoint,
              installedAt: p.installedAt,
              loaded: loaded.has(p.id),
              enabled: enabledSet.has(p.id),
              required: requiredSet.has(p.id),
              contributionsCount: count,
              contributions: c,
              requires: storedMeta?.requires ?? [],
              requiredBy: (requiredByMap.get(p.id) ?? []).sort(),
              description: probe.description,
              readme: readPluginReadme(p.entryPoint, locale),
            }
          })
          .sort((a, b) => a.id.localeCompare(b.id)),
        enabled,
        required: {
          all: required,
          core: [...CORE_REQUIRED_PLUGINS],
        },
        knownIds: listKnownPluginIds(),
        loaded: [...loaded].sort(),
        available: listKnownPluginIds()
          .filter((id) => !installed.find((p) => p.id === id))
          .map((id) => {
            const probe = probeAvailable(id)
            return { id, version: probe.version, source: probe.source, description: probe.description }
          })
          .sort((a, b) => a.id.localeCompare(b.id)),
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'List installed plugins with load + enable state',
        operationId: 'getInfraPlugins',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      query: t.Object({
        // Optional. Picks which `docs/README.<locale>.md` each row carries.
        // Falls back to en when the plugin hasn't been translated yet.
        locale: t.Optional(t.String()),
      }),
      response: { 200: ResponseSchema },
    },
  )
  .post(
    '/',
    async ({ body, set, admin, request }) => {
      const id = body.id.trim()
      if (!id) {
        set.status = 400
        return { error: 'id is required' }
      }
      let installed
      try {
        installed = await ensureInstalled(id)
      } catch (err) {
        // The installer currently catches NotImplementedError internally and
        // returns null. This branch is kept defensively for when the registry
        // path bubbles up real errors.
        const message = err instanceof Error ? err.message : 'install failed'
        if (err instanceof Error && err.name === 'NotImplementedError') {
          set.status = 501
          return {
            error: `registry source not implemented yet — could not install ${id} from registry. ${message}`,
          }
        }
        set.status = 500
        return { error: message }
      }
      if (!installed) {
        // Distinguish between "id we know about (workspace/bundled) but is
        // missing on disk" and "id we don't know about at all". The former is a
        // genuine 404; the latter implies the registry path (stubbed).
        const known = listKnownPluginIds().includes(id)
        if (!known) {
          set.status = 501
          return {
            error: `registry source not implemented yet — ${id} is not in workspace or bundled-plugins and registry lookups are stubbed`,
          }
        }
        set.status = 404
        return {
          error: `plugin "${id}" not found in workspace or bundled-plugins — check packages/plugin-${id}/ or bundled-plugins/${id}/`,
        }
      }
      const current = readEnabledList()
      const wasEnabled = current.includes(id)
      if (!wasEnabled) {
        await writeEnabledList([...current, id])
      }
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'infra.plugins.install',
        target: `plugin:${id}`,
        meta: { source: installed.source, version: installed.version, alreadyEnabled: wasEnabled },
      })
      return {
        ok: true,
        id: installed.id,
        version: installed.version,
        source: installed.source,
        entryPoint: installed.entryPoint,
        enabled: true,
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Install + enable a plugin by id',
        description:
          'Resolves the plugin via workspace > bundled > registry (registry stubbed). On success the id is added to infra.plugins.enabled (idempotent). Takes effect on next boot.',
        operationId: 'installInfraPlugin',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          ok: t.Boolean(),
          id: t.String(),
          version: t.String(),
          source: SourceSchema,
          entryPoint: t.String(),
          enabled: t.Boolean(),
        }),
        400: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
        501: t.Object({ error: t.String() }),
      },
    },
  )
