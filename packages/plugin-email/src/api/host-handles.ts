// host-handles — populated by register(host); modules read host services here.
//
// Plugin-email's facade/preferences/etc. lived in the core where `$db` and
// `$lib/logger` were direct imports. Inside the plugin we instead go through
// the PluginHost passed to register(). Modules call `host()` (which throws
// when register hasn't run yet) to retrieve the live host instance.

import type { PluginHost } from '@tabularium/plugin-host-types'

let _host: PluginHost | null = null

export function setHost(h: PluginHost): void {
  _host = h
}

export function host(): PluginHost {
  if (!_host) {
    throw new Error('plugin-email host not initialized — register(host) must run first')
  }
  return _host
}

/** Test-only — lets helpers reset the singleton between suites. */
export function __resetHostForTests(): void {
  _host = null
}
