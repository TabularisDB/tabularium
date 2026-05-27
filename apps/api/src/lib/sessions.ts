import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { db } from '$db'
import { sessions } from '$db/schema'

export interface CreateSessionInput {
  userId: string
  userAgent?: string | null
  ip?: string | null
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const id = ulid()
  await db.insert(sessions).values({
    id,
    userId: input.userId,
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
  })
  return id
}

// Returns true when the session is active (exists and not revoked). Updates
// lastSeenAt as a side-effect — cheap heartbeat used by audit UIs.
export async function touchSession(sessionId: string): Promise<boolean> {
  const row = await db.query.sessions.findFirst({
    where: { id: sessionId },
    columns: { revokedAt: true },
  })
  if (!row) return false
  if (row.revokedAt) return false
  await db.update(sessions).set({ lastSeenAt: Date.now() }).where(eq(sessions.id, sessionId))
  return true
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.id, sessionId))
}

// Revoke every active session for a user — used by admin "kick all" or
// password-change flows.
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.userId, userId))
}
