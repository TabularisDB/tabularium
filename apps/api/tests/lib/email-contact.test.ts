import { test, expect, beforeEach } from 'bun:test'
import { db } from '../../src/db'
import { rootCredentials } from '../../src/db/schema'
import { clearDb, makeUser } from '../helpers'
import { resolveUserContact } from '../../src/lib/email/contact'

beforeEach(clearDb)

test('resolveUserContact returns null when user has no rootCredentials row', async () => {
  const user = await makeUser()
  const contact = await resolveUserContact(user.id)
  expect(contact).toBeNull()
})

test('resolveUserContact returns id+email+locale=en when rootCredentials exists', async () => {
  const user = await makeUser()
  await db.insert(rootCredentials).values({
    userId: user.id,
    email: 'owner@example.com',
    passwordHash: 'unused-hash',
  })
  const contact = await resolveUserContact(user.id)
  expect(contact).toEqual({ id: user.id, email: 'owner@example.com', locale: 'en' })
})

test('resolveUserContact returns null for an unknown userId', async () => {
  const contact = await resolveUserContact('does-not-exist')
  expect(contact).toBeNull()
})
