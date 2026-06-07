import type { PluginHost, HostLogger } from '@tabularium/plugin-host-types'
import type { Logger } from 'pino'
import { db } from '$db'
import { cache } from '$lib/cache'
import { storage } from '$lib/storage'
import { logger } from '$lib/logger'
import { getSetting, hasSetting, setSetting, deleteSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { env } from '$lib/env'
import { encryptToken, decryptToken } from '$lib/crypto'
import { adminMiddleware } from '$middleware/admin'
import { authMiddleware } from '$middleware/auth'
import { registry } from './registry'
import { bus } from './events'
import { recordRoutes } from './route-collector'

function wrapLogger(l: Logger): HostLogger {
  return {
    info: (msg, meta) => l.info(meta ?? {}, msg),
    warn: (msg, meta) => l.warn(meta ?? {}, msg),
    error: (msg, meta) => l.error(meta ?? {}, msg),
    debug: (msg, meta) => l.debug(meta ?? {}, msg),
    child: (bindings) => wrapLogger(l.child(bindings)),
  }
}

/**
 * Build a PluginHost for a single plugin.
 *
 * `cache` and `storage` are accessor *functions* in the core (the underlying
 * instance is created at boot and read lazily). We expose them as-is so plugins
 * call `host.cache().get(...)` / `host.storage().put(...)` — same surface the
 * rest of the codebase uses.
 */
export function buildHost(id: string): PluginHost {
  return {
    id,
    logger: wrapLogger(logger.child({ plugin: id })),
    db,
    storage,
    cache,
    registry,
    events: bus,
    settings: {
      get: (key) => getSetting(key),
      has: (key) => hasSetting(key),
      set: (key, value, opts) => setSetting(key, value, opts),
      delete: (key) => deleteSetting(key),
    },
    audit: {
      record: (args) =>
        recordAudit({
          actorId: args.actorId,
          actorName: args.actorName,
          action: args.action,
          target: args.target ?? null,
          meta: args.meta ?? null,
          ip: args.ip ?? null,
        }),
      actorFromAdmin: (admin, request) => {
        const a = actorFromAdmin({ id: admin.id, displayName: admin.displayName ?? '' }, request)
        return {
          actorId: a.actorId ?? null,
          actorName: a.actorName ?? null,
          ip: a.ip ?? null,
        }
      },
    },
    env: {
      BASE_URL: env.BASE_URL,
      WEB_BASE_URL: env.WEB_BASE_URL ?? null,
    },
    middleware: {
      admin: adminMiddleware,
      auth: authMiddleware,
    },
    crypto: {
      encryptToken,
      decryptToken,
    },
    mountRoutes: (app) => recordRoutes(app),
  }
}
