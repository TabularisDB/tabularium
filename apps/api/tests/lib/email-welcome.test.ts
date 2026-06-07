import { test, expect, beforeEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { emailLog, rootCredentials } from '../../src/db/schema'
import { clearDb, makeUser } from '../helpers'
import { fireWelcomeEmail, __setProviderForTests } from '@tabularium/plugin-email'
import type { EmailProvider } from '@tabularium/plugin-email/types'

beforeEach(clearDb)

function stubProvider(): EmailProvider {
  return {
    name: 'stub' as const,
    async send() {
      return { providerMid: 'mid-welcome-1' }
    },
    async verifyAuth() {
      return { ok: true }
    },
  }
}

test('fireWelcomeEmail sends account.welcome when rootCredentials resolves', async () => {
  __setProviderForTests(stubProvider())
  const user = await makeUser({ username: 'welcomed' })
  await db.insert(rootCredentials).values({
    userId: user.id,
    email: 'welcomed@example.com',
    passwordHash: 'unused-hash',
  })

  await fireWelcomeEmail({ userId: user.id, username: 'welcomed' })

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'account.welcome'))
  expect(rows).toHaveLength(1)
  expect(rows[0].toAddress).toBe('welcomed@example.com')
  expect(rows[0].userId).toBe(user.id)
  expect(rows[0].status).toBe('sent')
})

test('fireWelcomeEmail silently skips when no rootCredentials (OAuth-only user)', async () => {
  __setProviderForTests(stubProvider())
  const user = await makeUser({ username: 'oauth-only' })

  await fireWelcomeEmail({ userId: user.id, username: 'oauth-only' })

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'account.welcome'))
  expect(rows).toHaveLength(0)
})

test('fireWelcomeEmail swallows provider errors and writes failed log row', async () => {
  __setProviderForTests({
    name: 'stub' as const,
    async send() {
      throw new Error('upstream rate limit')
    },
    async verifyAuth() {
      return { ok: true }
    },
  })
  const user = await makeUser({ username: 'failing' })
  await db.insert(rootCredentials).values({
    userId: user.id,
    email: 'failing@example.com',
    passwordHash: 'unused-hash',
  })

  // Must not throw.
  await fireWelcomeEmail({ userId: user.id, username: 'failing' })

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'account.welcome'))
  expect(rows).toHaveLength(1)
  expect(rows[0].status).toBe('failed')
  expect(rows[0].error).toContain('upstream rate limit')
})
