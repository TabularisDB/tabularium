import { and, eq, lt } from 'drizzle-orm'
import { db } from '$db'
import { pluginTransfers } from '$db/schema'

export const TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Mark any pending transfers whose `expiresAt` has passed as `expired`.
 * Runs before reads so the UI never shows a stale "pending" badge.
 */
export async function expireStalePending(): Promise<void> {
  await db
    .update(pluginTransfers)
    .set({ status: 'expired', respondedAt: Date.now() })
    .where(and(eq(pluginTransfers.status, 'pending'), lt(pluginTransfers.expiresAt, Date.now())))
}
