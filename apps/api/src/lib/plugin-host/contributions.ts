import type { PluginContributions } from '@tabularium/plugin-host-types'

type Collected = Record<keyof PluginContributions, Array<unknown>>

const collected: Collected = {
  'admin-nav-entry': [],
  'admin-page-route': [],
  'user-settings-nav-entry': [],
  'user-page-route': [],
  'public-page-route': [],
}

// Nav-entry contributions may declare inline `children`. The plugin author
// only stamps `pluginId` (implicitly) on the top-level entry; children should
// inherit it so consumers can always trace any node back to its owner.
function stampPluginId(entry: unknown, pluginId: string): Record<string, unknown> {
  const obj: Record<string, unknown> = { ...(entry as Record<string, unknown>), pluginId }
  const kids = obj.children
  if (Array.isArray(kids)) obj.children = kids.map((c) => stampPluginId(c, pluginId))
  return obj
}

export function recordContributions(pluginId: string, c: PluginContributions | undefined): void {
  if (!c) return
  for (const key of Object.keys(collected) as Array<keyof PluginContributions>) {
    const arr = c[key]
    if (!arr) continue
    for (const entry of arr) {
      collected[key].push(stampPluginId(entry, pluginId))
    }
  }
}

export function listContributions(): Collected {
  return collected
}

/** Test/reset helper. */
export function __clearContributions(): void {
  for (const k of Object.keys(collected) as Array<keyof typeof collected>) collected[k] = []
}
