import { eq } from 'drizzle-orm'
import { db } from '$db'
import { emailPreferences } from '$db/schema'
import { initPreferences } from './unsubscribe-token'
import {
  DEFAULT_PREFERENCES,
  OPT_IN_CATEGORIES,
  type EmailBucket,
  type EmailCategory,
  type EmailPreferences,
} from './types'

const VALID_BUCKETS: Record<EmailBucket, true> = {
  instant: true,
  daily: true,
  weekly: true,
  off: true,
}

export async function loadPreferences(userId: string): Promise<EmailPreferences> {
  const row = await db.query.emailPreferences.findFirst({ where: { userId } })
  if (!row) return { ...DEFAULT_PREFERENCES }
  let parsed: Partial<EmailPreferences>
  try {
    parsed = JSON.parse(row.prefs) as Partial<EmailPreferences>
  } catch {
    parsed = {}
  }
  return { ...DEFAULT_PREFERENCES, ...parsed }
}

export async function savePreferences(
  userId: string,
  patch: Partial<EmailPreferences>,
): Promise<EmailPreferences> {
  // Ensures the row + per-user nonce exist before we attempt to update.
  await initPreferences(userId)
  const current = await loadPreferences(userId)
  const next: EmailPreferences = { ...current }
  for (const k of Object.keys(patch) as EmailCategory[]) {
    const v = patch[k]
    if (v && VALID_BUCKETS[v]) next[k] = v
  }
  // Transactional category is always-on regardless of input.
  next.account = 'instant'
  await db
    .update(emailPreferences)
    .set({ prefs: JSON.stringify(next), updatedAt: Date.now() })
    .where(eq(emailPreferences.userId, userId))
  return next
}

export async function unsubscribeAllOptIn(userId: string): Promise<EmailPreferences> {
  const patch: Partial<EmailPreferences> = {}
  for (const c of OPT_IN_CATEGORIES) patch[c] = 'off'
  return savePreferences(userId, patch)
}
