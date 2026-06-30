import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { CORE_REQUIRED_PLUGINS, listPluginStoredMetas, listRequiredPlugins } from '$lib/plugin-host'
import { getSetting, setSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const ENABLED_SETTING_KEY = 'infra.plugins.enabled'

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
  const dedup = [...new Set(list)].sort()
  await setSetting(ENABLED_SETTING_KEY, JSON.stringify(dedup))
}

/**
 * Find every CURRENTLY-ENABLED plugin that lists `id` in its `requires`.
 *
 * Disabling such a plugin would either (a) leave the dependent broken at
 * runtime, or (b) silently get re-loaded on next boot because the loader
 * auto-seeds requires. Both outcomes confuse operators — refuse the disable
 * up front with a clear explanation instead.
 */
function findEnabledDependents(id: string, enabled: string[]): string[] {
  const enabledSet = new Set(enabled)
  return listPluginStoredMetas()
    .filter((m) => enabledSet.has(m.id) && m.id !== id && m.requires.includes(id))
    .map((m) => m.id)
    .sort()
}

export default new Elysia().use(adminMiddleware).put(
  '/',
  async ({ params, set, admin, request }) => {
    const id = params.id
    if (CORE_REQUIRED_PLUGINS.includes(id)) {
      set.status = 409
      return {
        error: `plugin "${id}" is required by the kernel — cannot disable`,
        blockers: [],
      }
    }
    if (listRequiredPlugins().includes(id)) {
      set.status = 409
      return {
        error: `plugin "${id}" is operator-required (infra.plugins.required) — cannot disable`,
        blockers: [],
      }
    }
    const current = readEnabledList()
    const dependents = findEnabledDependents(id, current)
    if (dependents.length > 0) {
      set.status = 409
      return {
        error: `plugin "${id}" is required by ${dependents.length} other enabled plugin(s): ${dependents.join(', ')} — disable them first`,
        blockers: dependents,
      }
    }
    const wasEnabled = current.includes(id)
    if (wasEnabled) {
      await writeEnabledList(current.filter((x) => x !== id))
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'infra.plugins.disable',
      target: `plugin:${id}`,
      meta: { wasEnabled },
    })
    return { ok: true, id, enabled: false, changed: wasEnabled }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Disable an installed plugin',
      description:
        'Removes the plugin id from infra.plugins.enabled. Refuses with 409 if the plugin is required (core or operator), or if any currently-enabled plugin declares this id in its requires. Takes effect on next boot.',
      operationId: 'disableInfraPlugin',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ ok: t.Boolean(), id: t.String(), enabled: t.Boolean(), changed: t.Boolean() }),
      409: t.Object({ error: t.String(), blockers: t.Array(t.String()) }),
    },
  },
)
