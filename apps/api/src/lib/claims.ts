import { and, eq, count } from 'drizzle-orm'
import { db, getDialect } from '$db'
import { pluginRequestClaims } from '$db/schema'

export async function claimRequest(requestId: string, userId: string): Promise<void> {
  const insert = db.insert(pluginRequestClaims).values({ requestId, userId })
  const dialect = getDialect()
  if (dialect === 'mysql') {
    try {
      await insert
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
    }
    return
  }
  await insert.onConflictDoNothing()
}

export async function unclaimRequest(requestId: string, userId: string): Promise<void> {
  await db.delete(pluginRequestClaims).where(
    and(
      eq(pluginRequestClaims.requestId, requestId),
      eq(pluginRequestClaims.userId, userId),
    ),
  )
}

export async function claimCount(requestId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(pluginRequestClaims)
    .where(eq(pluginRequestClaims.requestId, requestId))
  return rows[0]?.n ?? 0
}

export async function hasClaimedRequest(requestId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ requestId: pluginRequestClaims.requestId })
    .from(pluginRequestClaims)
    .where(
      and(
        eq(pluginRequestClaims.requestId, requestId),
        eq(pluginRequestClaims.userId, userId),
      ),
    )
    .limit(1)
  return rows.length > 0
}

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  return code === 'ER_DUP_ENTRY' || code === '23505'
}
