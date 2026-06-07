// Typed Drizzle handle for plugin-discord-notifier modules.
//
// Mirrors plugin-email/db.ts — `host.db` is the shared Drizzle instance the
// host hands to plugins. We re-type it here using the merged schema (core
// tables + this plugin's webhook_log table) so call sites get autocompletion
// without reaching into apps/api.

import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite'
import { defineRelations } from 'drizzle-orm'
import { host } from './host-handles'
import * as pluginSchema from './schema'
import * as coreSchema from '@tabularium/core-schema'

const mergedSchema = { ...coreSchema, ...pluginSchema }

const relations = defineRelations(mergedSchema, () => ({
  webhookLog: {},
}))

export type DB = SQLiteBunDatabase<typeof mergedSchema, typeof relations>

export function db(): DB {
  return host().db as DB
}

export * as schema from './schema'
