// Admin-CRUD-side wrapper around the active SuppressionSource (add/remove).
//
// The croner sync job uses `list()` from the same source(s) — see
// suppression-sync.ts. We keep the legacy `UpstreamDriver` name as the
// admin-facing surface so existing tests' `__setUpstreamDriverForTests` seam
// keeps working.

import { host } from './host-handles'
import type { SuppressionSource } from './types'

export type UpstreamDriver = {
  add(email: string, reason: string | null): Promise<void>
  remove(email: string): Promise<void>
}

let driverOverride: UpstreamDriver | null = null
export function __setUpstreamDriverForTests(d: UpstreamDriver | null): void {
  driverOverride = d
}

/**
 * Resolve the upstream driver used by admin suppression CRUD.
 *
 * Test seam wins. Otherwise we walk all registered `email-suppression-source`
 * impls and pick the first one whose `isActive()` returns true. Returns null
 * if none are configured — admin CRUD then proceeds local-only.
 */
export function getUpstreamDriver(): UpstreamDriver | null {
  if (driverOverride) return driverOverride
  const sources = host().registry.resolveAll<SuppressionSource>('email-suppression-source')
  for (const { impl } of sources) {
    if (impl.isActive()) {
      return {
        add: (email, reason) => impl.add(email, reason),
        remove: (email) => impl.remove(email),
      }
    }
  }
  return null
}
