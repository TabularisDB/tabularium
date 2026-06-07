import { db } from './db'

/**
 * Resolve a user's email contact for transactional sends.
 *
 * Reads `users.email`/`users.locale` first (P1+ — the canonical source).
 * Falls back to `rootCredentials.email` so a brief gap during the P1 backfill
 * doesn't drop mails for bootstrap admins whose `users.email` is still null.
 * Returns `null` when no email is known — callers treat that as "skip silently".
 */
export async function resolveUserContact(
  userId: string,
): Promise<{ id: string; email: string; locale: string } | null> {
  const user = await db().query.users.findFirst({ where: { id: userId } })
  if (user?.email) return { id: userId, email: user.email, locale: user.locale ?? 'en' }
  const rc = await db().query.rootCredentials.findFirst({ where: { userId } })
  if (rc?.email) return { id: userId, email: rc.email, locale: user?.locale ?? 'en' }
  return null
}
