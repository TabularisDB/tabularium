import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getInstalled } from '$lib/plugin-host'
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

export default new Elysia().use(adminMiddleware).put(
  '/',
  async ({ params, set, admin, request }) => {
    const id = params.id
    if (!getInstalled(id)) {
      set.status = 404
      return { error: `plugin "${id}" is not installed — install it first via POST /api/admin/infra/plugins` }
    }
    const current = readEnabledList()
    const wasEnabled = current.includes(id)
    if (!wasEnabled) {
      await writeEnabledList([...current, id])
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'infra.plugins.enable',
      target: `plugin:${id}`,
      meta: { alreadyEnabled: wasEnabled },
    })
    return { ok: true, id, enabled: true, changed: !wasEnabled }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Enable an installed plugin',
      description: 'Idempotently adds the plugin id to infra.plugins.enabled. Takes effect on next boot.',
      operationId: 'enableInfraPlugin',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ ok: t.Boolean(), id: t.String(), enabled: t.Boolean(), changed: t.Boolean() }),
      404: t.Object({ error: t.String() }),
    },
  },
)
