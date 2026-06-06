import { test, expect, beforeAll } from 'bun:test'
import { ulid } from 'ulid'
import { db } from '../../src/db'
import { emailLog } from '../../src/db/schema'
import { clearDb, makeUser } from '../helpers'

beforeAll(clearDb)

test('email_log accepts an insert and round-trips', async () => {
  const user = await makeUser()
  const id = ulid()
  await db.insert(emailLog).values({
    id,
    userId: user.id,
    trigger: 'plugin.approved',
    template: 'plugin.approved',
    locale: 'en',
    toAddress: user.username + '@example.com',
    fromAddress: 'Tabularium <noreply@tabularis.dev>',
    subject: 'Approved',
    provider: 'turbo',
    providerMid: '12345678901234567890',
    status: 'sent',
  })
  const row = await db.query.emailLog.findFirst({ where: { id } })
  expect(row?.trigger).toBe('plugin.approved')
  expect(row?.providerMid).toBe('12345678901234567890')
})
