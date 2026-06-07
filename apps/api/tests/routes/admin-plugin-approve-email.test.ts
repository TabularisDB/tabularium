import { test, expect, beforeEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import { buildApp, clearDb, makeAdmin, makeUser, makePlugin, adminHeaders } from '../helpers'
import { db } from '../../src/db'
import { emailLog, rootCredentials } from '../../src/db/schema'
import { __setProviderForTests } from '../../src/lib/email/facade'
import type { EmailProvider } from '../../src/lib/email/types'

beforeEach(clearDb)

function stubProvider(): EmailProvider {
  return {
    name: 'stub' as const,
    async send() {
      return { providerMid: 'mid-approved-1' }
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

async function patchPlugin(slug: string, admin: { jwt: string }, body: Record<string, unknown>) {
  const app = await buildApp()
  return app.handle(
    new Request(`http://localhost/api/admin/plugins/${slug}`, {
      method: 'PATCH',
      headers: { ...adminHeaders(admin as any), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

test('PATCH approve fires plugin.approved email to the owner', async () => {
  __setProviderForTests(stubProvider())
  const admin = await makeAdmin()
  const owner = await makeUser({ username: 'owner-a' })
  await db.insert(rootCredentials).values({
    userId: owner.id,
    email: 'owner-a@example.com',
    passwordHash: 'unused-hash',
  })
  await makePlugin(owner.id, { id: 'firestore-test', status: 'pending' })

  const res = await patchPlugin('firestore-test', admin, { status: 'approved' })
  expect(res.status).toBe(200)

  await flushMicrotasks()

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'plugin.approved'))
  expect(rows).toHaveLength(1)
  expect(rows[0].toAddress).toBe('owner-a@example.com')
  expect(rows[0].userId).toBe(owner.id)
  expect(rows[0].status).toBe('sent')
})

test('PATCH approve is idempotent — re-approving an already-approved plugin sends no extra email', async () => {
  __setProviderForTests(stubProvider())
  const admin = await makeAdmin()
  const owner = await makeUser({ username: 'owner-b' })
  await db.insert(rootCredentials).values({
    userId: owner.id,
    email: 'owner-b@example.com',
    passwordHash: 'unused-hash',
  })
  await makePlugin(owner.id, { id: 'firestore-test', status: 'pending' })

  const first = await patchPlugin('firestore-test', admin, { status: 'approved' })
  expect(first.status).toBe(200)
  await flushMicrotasks()

  const second = await patchPlugin('firestore-test', admin, { status: 'approved' })
  expect(second.status).toBe(200)
  await flushMicrotasks()

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'plugin.approved'))
  expect(rows).toHaveLength(1)
})

test('PATCH approve when owner has no rootCredentials writes no email (OAuth-only owner)', async () => {
  __setProviderForTests(stubProvider())
  const admin = await makeAdmin()
  const owner = await makeUser({ username: 'oauth-owner' })
  await makePlugin(owner.id, { id: 'firestore-test', status: 'pending' })

  const res = await patchPlugin('firestore-test', admin, { status: 'approved' })
  expect(res.status).toBe(200)

  await flushMicrotasks()

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'plugin.approved'))
  expect(rows).toHaveLength(0)
})
