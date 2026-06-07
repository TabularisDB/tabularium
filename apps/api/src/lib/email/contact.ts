import { db } from '$db'

/**
 * Resolve a user's email contact for transactional sends.
 *
 * P0 reality: `users` has no `email`/`locale` columns. The only place an
 * address lives is `rootCredentials` (bootstrap admin email). OAuth-only
 * users have no email at all and this returns `null` — callers must treat
 * that as "skip the send silently". Locale is hardcoded to 'en' until the
 * P1+ migration adds a per-user preference.
 */
export async function resolveUserContact(
  userId: string,
): Promise<{ id: string; email: string; locale: string } | null> {
  const rc = await db.query.rootCredentials.findFirst({ where: { userId } })
  if (!rc) return null
  return { id: userId, email: rc.email, locale: 'en' }
}
