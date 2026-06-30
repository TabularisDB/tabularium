// host-handles — populated by register(host); route modules read host services
// here. Mirrors plugin-email's pattern so route factories can chain
// `.use(adminMw())` without threading the host through every parameter list.

import type { PluginHost } from '@tabularium/plugin-host-types'
import type { Elysia } from 'elysia'

let _host: PluginHost | null = null

export function setHost(h: PluginHost): void {
  _host = h
}

export function host(): PluginHost {
  if (!_host) {
    throw new Error('plugin-turbosmtp host not initialized — register(host) must run first')
  }
  return _host
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adminMw(): Elysia<any, any, any, any, any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return host().middleware.admin as any
}

export function __resetHostForTests(): void {
  _host = null
}
