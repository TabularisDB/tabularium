import { test, expect, beforeEach } from 'bun:test'
import { db } from '../../src/db'
import { rootCredentials } from '../../src/db/schema'
import { clearDb, makeUser } from '../helpers'
import { resolveUserContact } from '../../src/lib/email/contact'

beforeEach(clearDb)

test('resolveUserContact returns null when user has no email anywhere', async () => {
  const user = await makeUser()
  const contact = await resolveUserContact(user.id)
  expect(contact).toBeNull()
})

test('resolveUserContact reads users.email + users.locale when present', async () => {
  const user = await makeUser({ email: 'u@example.com', locale: 'de' })
  const contact = await resolveUserContact(user.id)
  expect(contact).toEqual({ id: user.id, email: 'u@example.com', locale: 'de' })
})

test('resolveUserContact defaults locale to en when users.locale is missing', async () => {
  const user = await makeUser({ email: 'u2@example.com' })
  const contact = await resolveUserContact(user.id)
  expect(contact?.locale).toBe('en')
})

test('resolveUserContact falls back to rootCredentials when users.email is null', async () => {
  const user = await makeUser()
  await db.insert(rootCredentials).values({
    userId: user.id,
    email: 'admin@example.com',
    passwordHash: 'unused-hash',
  })
  const contact = await resolveUserContact(user.id)
  expect(contact).toEqual({ id: user.id, email: 'admin@example.com', locale: 'en' })
})

test('resolveUserContact prefers users.email over rootCredentials', async () => {
  const user = await makeUser({ email: 'primary@example.com' })
  await db.insert(rootCredentials).values({
    userId: user.id,
    email: 'admin-fallback@example.com',
    passwordHash: 'unused-hash',
  })
  const contact = await resolveUserContact(user.id)
  expect(contact?.email).toBe('primary@example.com')
})

test('resolveUserContact returns null for an unknown userId', async () => {
  const contact = await resolveUserContact('does-not-exist')
  expect(contact).toBeNull()
})
