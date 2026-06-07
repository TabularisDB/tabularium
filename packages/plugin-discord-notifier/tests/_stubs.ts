// Test helpers — build a stub PluginHost backed by an in-memory bun:sqlite
// database with the plugin's table created via raw SQL. We avoid drizzle-kit
// here so the test stays hermetic; the SQL mirrors what the dialect-specific
// migration creates.

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { PluginHost } from '@tabularium/plugin-host-types'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS pl_discord_notifier__webhook_log (
  id text PRIMARY KEY NOT NULL,
  event text NOT NULL,
  status text NOT NULL,
  http_status integer,
  error text,
  sent_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS pl_discord_notifier__webhook_log_sent_idx
  ON pl_discord_notifier__webhook_log (sent_at);
CREATE INDEX IF NOT EXISTS pl_discord_notifier__webhook_log_event_sent_idx
  ON pl_discord_notifier__webhook_log (event, sent_at);
`

export interface StubHostHandle {
  host: PluginHost
  settings: Map<string, { value: string; encrypted?: boolean }>
  routes: unknown[]
  // Loosely-typed emit — the kernel's DomainEvents type unions all event keys,
  // making per-key payload narrowing painful at a test seam. Tests pass the
  // exact payload shape for their event of interest.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit: (event: string, payload: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  reset: () => void
}

export function makeStubHost(): StubHostHandle {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(CREATE_TABLE)
  const drizzleDb = drizzle({ client: sqlite })

  const settings = new Map<string, { value: string; encrypted?: boolean }>()
  const routes: unknown[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, ((p: any) => void | Promise<void>)[]>()

  const host: PluginHost = {
    id: 'discord-notifier',
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => host.logger,
    },
    db: drizzleDb,
    storage: {},
    cache: {},
    registry: {
      definePoint: () => {},
      register: () => {},
      resolve: () => null,
      resolveAll: () => [],
      setActive: () => {},
      getActive: () => null,
    },
    events: {
      on: (event, handler) => {
        const bucket = handlers.get(event as string) ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bucket.push(handler as any)
        handlers.set(event as string, bucket)
        return () => {
          const b = handlers.get(event as string) ?? []
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          handlers.set(event as string, b.filter((h) => h !== (handler as any)))
        }
      },
      emit: (event, payload) => {
        const bucket = handlers.get(event as string) ?? []
        for (const h of bucket) {
          void h(payload)
        }
      },
    },
    settings: {
      get: (key) => settings.get(key)?.value,
      has: (key) => settings.has(key),
      set: async (key, value, opts) => {
        settings.set(key, { value, encrypted: opts?.encrypted })
      },
      delete: async (key) => {
        settings.delete(key)
      },
    },
    audit: {
      record: async () => {},
      actorFromAdmin: () => ({ actorId: null, actorName: null, ip: null }),
    },
    env: { BASE_URL: 'http://localhost', WEB_BASE_URL: null },
    middleware: { admin: undefined, auth: undefined },
    crypto: { encryptToken: (x) => x, decryptToken: (x) => x },
    mountRoutes: (app) => {
      routes.push(app)
    },
  }

  return {
    host,
    settings,
    routes,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit: (event, payload) => host.events.emit(event as any, payload),
    db: drizzleDb,
    reset: () => {
      sqlite.close()
    },
  }
}
