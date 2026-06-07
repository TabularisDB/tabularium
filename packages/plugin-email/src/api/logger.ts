// Lazy logger helper — modules call `log('module-tag').info(...)`. Both
// `log()` and the returned object are evaluated lazily: the pino child is
// built the first time you actually log something, never at module load.
// That matters because route modules import this file before register(host)
// has populated host-handles.

import type { HostLogger } from '@tabularium/plugin-host-types'
import { host } from './host-handles'

const cache = new Map<string, HostLogger>()

function resolve(module: string): HostLogger {
  const hit = cache.get(module)
  if (hit) return hit
  const made = host().logger.child({ module })
  cache.set(module, made)
  return made
}

/**
 * Returns a thin proxy whose methods defer to a memoized child logger.
 * The child is only built on first method call, after register(host) has
 * run, so calling `log('x')` at module-eval time is safe.
 */
export function log(module: string): HostLogger {
  return {
    info: (msg, meta) => resolve(module).info(msg, meta),
    warn: (msg, meta) => resolve(module).warn(msg, meta),
    error: (msg, meta) => resolve(module).error(msg, meta),
    debug: (msg, meta) => resolve(module).debug(msg, meta),
    child: (bindings) => resolve(module).child(bindings),
  }
}

/** Test/reset helper for hot-swap host changes between suites. */
export function __resetLogCacheForTests(): void {
  cache.clear()
}
