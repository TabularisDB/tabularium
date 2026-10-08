import { and, eq, isNull, lt } from 'drizzle-orm'
import { db, getDialect } from '$db'
import { oauthRecords as sqliteTable } from '$db/schema'
import { oauthRecords as pgTable } from '$db/schema.pg'
import { oauthRecords as mysqlTable } from '$db/schema.mysql'

// The DB facade is typed as SQLite; select the actual dialect's table for SQL.
function table(): typeof sqliteTable {
  return (getDialect() === 'pg' ? pgTable : getDialect() === 'mysql' ? mysqlTable : sqliteTable) as typeof sqliteTable
}
export type Kind = 'client' | 'grant' | 'code' | 'access' | 'refresh' | 'consent'
export async function putRecord(
  id: string,
  kind: Kind,
  payload: unknown,
  expiresAt: number,
  userId: string | null = null,
) {
  if (kind === 'client') {
    const t = table()
    // Keep spent credentials until their entire grant lifetime has passed.
    await db.delete(t).where(lt(t.expiresAt, Date.now() - 30 * 86400_000))
  }
  await db.insert(table()).values({ id, kind, payload: JSON.stringify(payload), expiresAt, userId })
}
export async function readRecord<T>(id: string, kind: Kind) {
  const t = table()
  const [row] = await db
    .select()
    .from(t)
    .where(and(eq(t.id, id), eq(t.kind, kind)))
    .limit(1)
  return row ? { ...row, data: JSON.parse(row.payload) as T } : null
}
export async function consumeRecord(id: string): Promise<boolean> {
  const t = table()
  const nonce = crypto.randomUUID()
  // Compare-and-set is atomic on all supported SQL backends, unlike a read
  // followed by an unconditional delete. Keep consumed rows for replay checks.
  await db
    .update(t)
    .set({ consumedBy: nonce })
    .where(and(eq(t.id, id), isNull(t.consumedBy)))
  const [row] = await db.select({ consumedBy: t.consumedBy }).from(t).where(eq(t.id, id)).limit(1)
  return row?.consumedBy === nonce
}
export async function revokeRecord(id: string) {
  const t = table()
  await db.update(t).set({ revokedAt: Date.now() }).where(eq(t.id, id))
}
export async function userGrants(userId: string) {
  const t = table()
  return db
    .select()
    .from(t)
    .where(and(eq(t.kind, 'grant'), eq(t.userId, userId)))
}
