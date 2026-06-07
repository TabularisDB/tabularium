import type { PluginContributions } from '@tabularium/plugin-host-types'

type Collected = Record<keyof PluginContributions, Array<unknown>>

const collected: Collected = {
  'admin-nav-entry': [],
  'admin-page-route': [],
  'user-settings-nav-entry': [],
  'user-page-route': [],
  'public-page-route': [],
}

export function recordContributions(pluginId: string, c: PluginContributions | undefined): void {
  if (!c) return
  for (const key of Object.keys(collected) as Array<keyof PluginContributions>) {
    const arr = c[key]
    if (!arr) continue
    for (const entry of arr) {
      collected[key].push({ ...(entry as object), pluginId })
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
