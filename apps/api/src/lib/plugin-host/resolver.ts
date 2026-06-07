import { ensureInstalled } from './installer'

type Loader = () => Promise<unknown>

/**
 * Resolve a plugin loader by delegating to the install simulator. The
 * installer picks workspace > bundled > registry (registry is stubbed for
 * SP1). Returns null when no source can satisfy the id so the kernel
 * warns-and-skips instead of throwing.
 *
 * Bun handles .ts imports natively; the entry point is either a workspace src
 * path (dev) or a bundled-plugins src path (prod).
 */
export async function resolvePluginLoader(id: string): Promise<Loader | null> {
  const installed = await ensureInstalled(id)
  if (!installed) return null
  return () => import(installed.entryPoint)
}

// SP1 simulator inventory — the set of plugin ids Tabularium currently ships
// with. When the live registry comes online this becomes a remote index query.
const SHIPPED_PLUGIN_IDS = ['email', 'smtp', 'turbosmtp', 'discord-notifier']

export function listKnownPluginIds(): string[] {
  return [...SHIPPED_PLUGIN_IDS]
}
