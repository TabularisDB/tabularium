import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import {
  CORE_REQUIRED_PLUGINS,
  deleteInstalled,
  getInstalled,
  listRequiredPlugins,
} from '$lib/plugin-host'
import { deleteSetting, getSetting, hasSetting, setSetting } from '$lib/settings'
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

export default new Elysia().use(adminMiddleware).delete(
  '/',
  async ({ params, set, admin, request }) => {
    const id = params.id
    if (CORE_REQUIRED_PLUGINS.includes(id)) {
      set.status = 409
      return { error: `plugin "${id}" is core-required by the kernel — cannot uninstall` }
    }
    if (listRequiredPlugins().includes(id)) {
      set.status = 409
      return { error: `plugin "${id}" is operator-required (infra.plugins.required) — cannot uninstall` }
    }
    const record = getInstalled(id)
    const settingKey = `plugins.installed.${id}`
    const persisted = hasSetting(settingKey)
    if (!record && !persisted) {
      set.status = 404
      return { error: `plugin "${id}" is not installed` }
    }
    const current = readEnabledList()
    const wasEnabled = current.includes(id)
    if (wasEnabled) {
      await writeEnabledList(current.filter((x) => x !== id))
    }
    deleteInstalled(id)
    if (persisted) {
      await deleteSetting(settingKey)
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'infra.plugins.uninstall',
      target: `plugin:${id}`,
      meta: { wasEnabled, source: record?.source ?? null },
    })
    return { ok: true, id, removedFromEnabled: wasEnabled }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Uninstall a plugin (remove from enabled list + drop install record)',
      description:
        'Drops the in-process install record and deletes the persisted plugins.installed.<id> setting. Refuses with 409 when the plugin is required by the kernel or by the operator setting.',
      operationId: 'uninstallInfraPlugin',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ ok: t.Boolean(), id: t.String(), removedFromEnabled: t.Boolean() }),
      404: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  },
)
