// host-handles — populated by register(host); modules read host services here.
//
// Same pattern as plugin-email: register(host) calls setHost(); downstream
// modules (webhook sender, routes) call host() to get a live reference.

import type { PluginHost } from '@tabularium/plugin-host-types'
import type { Elysia } from 'elysia'

let _host: PluginHost | null = null

export function setHost(h: PluginHost): void {
  _host = h
}

export function host(): PluginHost {
  if (!_host) {
    throw new Error('plugin-discord-notifier host not initialized — register(host) must run first')
  }
  return _host
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adminMw(): Elysia<any, any, any, any, any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return host().middleware.admin as any
}

/** Test-only — lets helpers reset the singleton between suites. */
export function __resetHostForTests(): void {
  _host = null
}
