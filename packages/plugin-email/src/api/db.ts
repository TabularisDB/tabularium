// Typed db handle re-exported for plugin-email modules.
//
// `host().db` is `unknown` in the host types (kept Elysia/Drizzle-free). The
// plugin still wants typed access to the same Drizzle instance, so we cast
// through a single helper that pulls the live DB type from core.
//
// The relative path back into apps/api is the SP1 stopgap: long-term the
// plugin will own its own schema (cf. Task 14 of the plugin-kernel plan).

import type { DB } from '../../../../apps/api/src/db'
import { host } from './host-handles'

export function db(): DB {
  return host().db as DB
}

export type { DB }
export * as schema from '../../../../apps/api/src/db/schema'
