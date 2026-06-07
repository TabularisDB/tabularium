import { test, expect, beforeEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import { buildApp, clearDb } from '../helpers'
import { db } from '../../src/db'
import { emailLog } from '../../src/db/schema'
import { __setProviderForTests } from '@tabularium/plugin-email'
import type { EmailProvider } from '@tabularium/plugin-email/types'

beforeEach(clearDb)

function stubProvider(): EmailProvider {
  return {
    name: 'stub' as const,
    async send() {
      return { providerMid: 'mid-register-welcome-1' }
    },
    async verifyAuth() {
      return { ok: true }
    },
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 10))
}

test('POST /auth/email/register fires account.welcome to the normalized email', async () => {
  __setProviderForTests(stubProvider())
  const app = await buildApp()

  const res = await app.handle(
    new Request('http://localhost/auth/email/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'Boot.Admin@Example.COM',
        password: 'corr-horse-battery',
        displayName: 'Boot Admin',
      }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; user: { id: string } }
  expect(data.ok).toBe(true)

  await flushMicrotasks()

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'account.welcome'))
  expect(rows).toHaveLength(1)
  expect(rows[0].toAddress).toBe('boot.admin@example.com')
  expect(rows[0].status).toBe('sent')
  expect(rows[0].userId).toBe(data.user.id)
})
