// Typed Drizzle handle for plugin-email modules.
//
// Plugins under Tabularium run on Bun + Elysia + Drizzle. `host.db` is the
// shared Drizzle instance the host hands to plugins; we re-type it locally
// using the merged schema (core tables + this plugin's tables) plus the
// relations the plugin actually queries, so call sites get autocompletion
// without reaching back into apps/api.
//
// This contract is the whole point of @tabularium/core-schema: plugins FK
// against core tables they import from there, and never from a relative
// `../../apps/api/...` path.

import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite'
import { defineRelations } from 'drizzle-orm'
import { host } from './host-handles'
import * as pluginSchema from './schema'
import * as coreSchema from '@tabularium/core-schema'

const mergedSchema = { ...coreSchema, ...pluginSchema }

// Local relations covering only the tables this plugin queries through the
// relational API (`db().query.x.findFirst(...)`). The host's runtime DB
// instance was built with the api app's full relations set; this is just a
// structurally-compatible view onto it for type-checking purposes.
const relations = defineRelations(mergedSchema, (r) => ({
  users: {},
  rootCredentials: {},
  emailPreferences: {
    user: r.one.users({ from: r.emailPreferences.userId, to: r.users.id }),
  },
  emailSuppression: {},
}))

export type DB = SQLiteBunDatabase<typeof mergedSchema, typeof relations>

export function db(): DB {
  return host().db as DB
}

export type { DB as PluginDB }
export * as schema from './schema'
