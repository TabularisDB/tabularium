import type { PluginModule } from '@tabularium/plugin-host-types'
import { logger } from '$lib/logger'
import { getSetting } from '$lib/settings'
import { resolvePluginLoader } from './resolver'
import { buildHost } from './host'
import { recordContributions } from './contributions'
import { registry } from './registry'

const log = logger.child({ module: 'plugin-loader' })

const loaded = new Set<string>()
const inProgress = new Set<string>()
const seededBy = new Map<string, string>()
const ENABLED_SETTING_KEY = 'infra.plugins.enabled'
const DEFAULT_ENABLED: string[] = ['email', 'turbosmtp']

type LoaderOverride = (id: string) => Promise<PluginModule>
let loaderOverride: LoaderOverride | null = null

export function __setLoaderForTests(loader: LoaderOverride | null): void {
  loaderOverride = loader
}

export function __clearLoadedForTests(): void {
  loaded.clear()
  inProgress.clear()
  seededBy.clear()
}

/** Test-only readback of which plugins got auto-seeded by which requires. */
export function __seededByForTests(): ReadonlyMap<string, string> {
  return seededBy
}

/**
 * The kernel defines the points it cares about before plugins try to register
 * against them. Idempotent so re-init in tests works.
 */
function defineBuiltInPoints(): void {
  const points = [
    { id: 'email-provider', arity: 'single-active' as const },
    // Contract for upstream provider bootstrap (TurboSMTP authorize + consumer-key
    // dance). Plugins implementing this are kingmakers for the admin's
    // "set me up from email + password" flow. Single-active: only one upstream
    // can drive bootstrap at a time.
    { id: 'email-bootstrap-driver', arity: 'single-active' as const },
    // Contract for upstream suppression sources (TurboSMTP-style suppression
    // list with add/remove + paginated list). Multi: in theory we could
    // aggregate from several providers; in practice one is active.
    { id: 'email-suppression-source', arity: 'multi' as const },
  ]
  for (const p of points) {
    try {
      registry.definePoint(p)
    } catch (err) {
      // already-defined is fine on re-init
      if (!(err instanceof Error) || !err.message.startsWith('extension point already defined')) {
        throw err
      }
    }
  }
  // Nav / route contribution points are tracked via `contributions.ts`, not the
  // registry, because they're declarative metadata, not pluggable implementations.
}

function getEnabledList(): string[] {
  const raw = getSetting(ENABLED_SETTING_KEY)
  if (!raw) return DEFAULT_ENABLED
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed
  } catch {
    // fall through
  }
  log.warn({ raw }, 'infra.plugins.enabled is not a JSON string[]; using defaults')
  return DEFAULT_ENABLED
}

async function resolveModule(id: string): Promise<PluginModule | null> {
  if (loaderOverride) {
    return await loaderOverride(id)
  }
  const loader = resolvePluginLoader(id)
  if (!loader) return null
  return (await loader()) as PluginModule
}

/**
 * Recursively ensure a plugin is loaded. Handles three concerns:
 *
 * 1. Auto-seed: a plugin's `meta.requires` are loaded transitively even when
 *    they're absent from `infra.plugins.enabled`. The auto-seeded id is tracked
 *    in `seededBy` so operators (and tests) can see who pulled it in.
 * 2. Topo order: requires resolve before the dependent's `register(host)` runs,
 *    so providers register against extension points before orchestrators read
 *    them.
 * 3. Cycle detection: `inProgress` set catches A → B → A. The error aborts the
 *    chain that started it, but the outer `initPlugins` try/catch keeps other
 *    plugins loading.
 */
async function ensureLoaded(id: string, requestedBy?: string): Promise<void> {
  if (loaded.has(id)) return
  if (inProgress.has(id)) {
    throw new Error(
      `cyclic plugin dependency: ${id} requested by ${requestedBy ?? '(root)'} but already loading`,
    )
  }

  const mod = await resolveModule(id)
  if (!mod) {
    log.warn({ id, requestedBy }, 'unknown plugin id — skipping')
    return
  }
  if (mod.meta.id !== id) {
    log.warn(
      { requested: id, declared: mod.meta.id },
      'plugin meta id mismatch — proceeding with declared id',
    )
  }
  const declaredId = mod.meta.id

  if (loaded.has(declaredId)) return
  if (inProgress.has(declaredId)) {
    throw new Error(
      `cyclic plugin dependency: ${declaredId} requested by ${requestedBy ?? '(root)'} but already loading`,
    )
  }

  inProgress.add(declaredId)
  try {
    // Topo-load requires before this plugin's own register() runs.
    for (const req of mod.meta.requires ?? []) {
      if (req === declaredId) continue
      if (!loaded.has(req)) {
        if (requestedBy === undefined) seededBy.set(req, declaredId)
        else if (!seededBy.has(req)) seededBy.set(req, declaredId)
      }
      await ensureLoaded(req, declaredId)
    }

    const host = buildHost(declaredId)
    await mod.register(host)
    recordContributions(declaredId, mod.meta.contributions)
    loaded.add(declaredId)
    log.info(
      { id: declaredId, version: mod.meta.version, requestedBy },
      'plugin loaded',
    )
  } finally {
    inProgress.delete(declaredId)
  }
}

export async function initPlugins(): Promise<void> {
  defineBuiltInPoints()
  const enabled = getEnabledList()
  log.info({ enabled }, 'loading plugins')
  for (const id of enabled) {
    try {
      if (loaded.has(id)) {
        // Already loaded transitively as a require of an earlier id — this is
        // not a duplicate request, just an explicit confirmation.
        continue
      }
      await ensureLoaded(id)
    } catch (err) {
      log.error({ err, id }, 'plugin failed to load — instance continues without it')
    }
  }
  if (seededBy.size > 0) {
    log.info(
      { seeded: Object.fromEntries(seededBy) },
      'auto-seeded plugins via requires',
    )
  }
}
