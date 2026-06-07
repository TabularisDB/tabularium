import { test, expect, beforeAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { users, emailPreferences, emailSuppression } from '../../src/db/schema'
import { clearDb } from '../helpers'

beforeAll(clearDb)

test('users accepts email and locale', async () => {
  await db.insert(users).values({ id: 'u1', displayName: 'A', email: 'a@example.com', locale: 'de' })
  const row = await db.query.users.findFirst({ where: { id: 'u1' } })
  expect(row?.email).toBe('a@example.com')
  expect(row?.locale).toBe('de')
})

test('users.email is unique', async () => {
  await db.insert(users).values({ id: 'u2', displayName: 'B', email: 'dup@example.com' })
  let threw = false
  try {
    await db.insert(users).values({ id: 'u3', displayName: 'C', email: 'dup@example.com' })
  } catch {
    threw = true
  }
  expect(threw).toBe(true)
})

test('email_preferences cascades on user delete', async () => {
  await db.insert(users).values({ id: 'u4', displayName: 'D' })
  await db.insert(emailPreferences).values({ userId: 'u4', prefs: '{}', tokenNonce: 'n1' })
  await db.delete(users).where(eq(users.id, 'u4'))
  const row = await db.query.emailPreferences.findFirst({ where: { userId: 'u4' } })
  expect(row).toBeUndefined()
})

test('email_suppression accepts insert and round-trips', async () => {
  await db.insert(emailSuppression).values({ email: 'bad@example.com', source: 'bounce', reason: '550 mailbox full' })
  const row = await db.query.emailSuppression.findFirst({ where: { email: 'bad@example.com' } })
  expect(row?.source).toBe('bounce')
  expect(row?.reason).toBe('550 mailbox full')
})
