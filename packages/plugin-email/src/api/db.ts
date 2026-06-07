// Typed db handle + schema re-export for plugin-email modules.
//
// `host().db` is `unknown` in the host types (kept Elysia/Drizzle-free). The
// plugin still wants typed access to the same Drizzle instance, so we cast
// through a single helper that pulls the live DB type from core.
//
// ─────────────────────────────────────────────────────────────────────────────
// KNOWN ACCEPTABLE COUPLING (SP1)
//
// The two `../../../../apps/api/src/db*` reach-backs below are the only
// remaining places plugin-email imports from core. drizzle-kit needs every
// table definition under apps/api/src/db/schema for the migration generator
// to see the email_log / email_preferences / email_suppression tables when
// reading the core schema entry point. Moving the schemas into a per-plugin
// package is the SP6 cleanup ("Move email schemas into plugin-email"); until
// then this re-export is the documented seam.
// ─────────────────────────────────────────────────────────────────────────────

import type { DB } from '../../../../apps/api/src/db'
import { host } from './host-handles'

export function db(): DB {
  return host().db as DB
}

export type { DB }
export * as schema from '../../../../apps/api/src/db/schema'
