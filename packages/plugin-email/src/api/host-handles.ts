// host-handles — populated by register(host); modules read host services here.
//
// Plugin-email's facade/preferences/etc. lived in the core where `$db` and
// `$lib/logger` were direct imports. Inside the plugin we instead go through
// the PluginHost passed to register(). Modules call `host()` (which throws
// when register hasn't run yet) to retrieve the live host instance.

import type { PluginHost } from '@tabularium/plugin-host-types'
import type { Elysia } from 'elysia'

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

/**
 * Typed shorthands for the core auth/admin middleware Elysia derive plugins.
 *
 * `host.middleware.admin` is `unknown` (the host types stay Elysia-free) — we
 * cast it back through these helpers so route factories can chain `.use()`
 * without TS complaining about the property-bag type.
 *
 * The route bodies destructure `admin`/`user` from the handler context; we
 * type that via parameter annotations at the route site rather than threading
 * the derive shape through here (Elysia's generic positional parameters make
 * a precise return type painful).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adminMw(): Elysia<any, any, any, any, any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return host().middleware.admin as any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function authMw(): Elysia<any, any, any, any, any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return host().middleware.auth as any
}

/** Test-only — lets helpers reset the singleton between suites. */
export function __resetHostForTests(): void {
  _host = null
}
