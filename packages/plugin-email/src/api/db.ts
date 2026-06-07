// Typed db handle + schema re-export for plugin-email modules.
//
// `host().db` is `unknown` in the host types (kept Elysia/Drizzle-free). The
// plugin still wants typed access to the same Drizzle instance, so we cast
// through a single helper that pulls the live DB type from core.
//
// ─────────────────────────────────────────────────────────────────────────────
// KNOWN ACCEPTABLE COUPLING
//
// The `../../../../apps/api/src/db` reach-back below is the only remaining
// place plugin-email imports from core, and it's purely a type import — at
// runtime nothing crosses the boundary. The schemas themselves now live in
// this package (./schema*.ts) with the kernel-enforced `pl_email__` prefix,
// re-exported by core's schema entrypoint so drizzle-kit still sees them.
// ─────────────────────────────────────────────────────────────────────────────

import type { DB } from '../../../../apps/api/src/db'
import { host } from './host-handles'

export function db(): DB {
  return host().db as DB
}

export type { DB }
export * as schema from './schema'
