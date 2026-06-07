import type { PluginModule } from '@tabularium/plugin-host-types'
import { logger } from '$lib/logger'
import { getSetting } from '$lib/settings'
import { resolvePluginLoader } from './resolver'
import { buildHost } from './host'
import { recordContributions } from './contributions'
import { registry } from './registry'

const log = logger.child({ module: 'plugin-loader' })

const loaded = new Set<string>()
const ENABLED_SETTING_KEY = 'infra.plugins.enabled'
const DEFAULT_ENABLED: string[] = ['email', 'turbosmtp']

type LoaderOverride = (id: string) => Promise<PluginModule>
let loaderOverride: LoaderOverride | null = null

export function __setLoaderForTests(loader: LoaderOverride | null): void {
  loaderOverride = loader
}

export function __clearLoadedForTests(): void {
  loaded.clear()
}

/**
 * The kernel defines the points it cares about before plugins try to register
 * against them. Idempotent so re-init in tests works.
 */
function defineBuiltInPoints(): void {
  try {
    registry.definePoint({ id: 'email-provider', arity: 'single-active' })
  } catch (err) {
    // already-defined is fine on re-init
    if (!(err instanceof Error) || !err.message.startsWith('extension point already defined')) {
      throw err
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

async function loadOne(id: string): Promise<void> {
  if (loaded.has(id)) return
  let mod: PluginModule
  if (loaderOverride) {
    mod = await loaderOverride(id)
  } else {
    const loader = resolvePluginLoader(id)
    if (!loader) {
      log.warn({ id }, 'unknown plugin id — skipping')
      return
    }
    mod = (await loader()) as PluginModule
  }
  if (mod.meta.id !== id) {
    log.warn({ requested: id, declared: mod.meta.id }, 'plugin meta id mismatch — proceeding with declared id')
  }
  const host = buildHost(mod.meta.id)
  await mod.register(host)
  recordContributions(mod.meta.id, mod.meta.contributions)
  loaded.add(mod.meta.id)
  log.info({ id: mod.meta.id, version: mod.meta.version }, 'plugin loaded')
}

export async function initPlugins(): Promise<void> {
  defineBuiltInPoints()
  const enabled = getEnabledList()
  log.info({ enabled }, 'loading plugins')
  for (const id of enabled) {
    try {
      await loadOne(id)
    } catch (err) {
      log.error({ err, id }, 'plugin failed to load — instance continues without it')
    }
  }
}
