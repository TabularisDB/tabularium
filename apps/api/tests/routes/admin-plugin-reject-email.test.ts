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
      return { providerMid: 'mid-rejected-1' }
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

test('PATCH reject fires plugin.rejected email to the owner', async () => {
  __setProviderForTests(stubProvider())
  const admin = await makeAdmin()
  const owner = await makeUser({ username: 'owner-r' })
  await db.insert(rootCredentials).values({
    userId: owner.id,
    email: 'owner-r@example.com',
    passwordHash: 'unused-hash',
  })
  await makePlugin(owner.id, { id: 'firestore-test', status: 'pending' })

  const res = await patchPlugin('firestore-test', admin, {
    status: 'rejected',
    rejectionReason: 'manifest validation failed',
  })
  expect(res.status).toBe(200)

  await flushMicrotasks()

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'plugin.rejected'))
  expect(rows).toHaveLength(1)
  expect(rows[0].toAddress).toBe('owner-r@example.com')
  expect(rows[0].userId).toBe(owner.id)
  expect(rows[0].status).toBe('sent')
})

test('PATCH reject is idempotent — re-rejecting an already-rejected plugin sends no extra email', async () => {
  __setProviderForTests(stubProvider())
  const admin = await makeAdmin()
  const owner = await makeUser({ username: 'owner-r2' })
  await db.insert(rootCredentials).values({
    userId: owner.id,
    email: 'owner-r2@example.com',
    passwordHash: 'unused-hash',
  })
  await makePlugin(owner.id, { id: 'firestore-test', status: 'pending' })

  const first = await patchPlugin('firestore-test', admin, {
    status: 'rejected',
    rejectionReason: 'first reason',
  })
  expect(first.status).toBe(200)
  await flushMicrotasks()

  const second = await patchPlugin('firestore-test', admin, {
    status: 'rejected',
    rejectionReason: 'second reason',
  })
  expect(second.status).toBe(200)
  await flushMicrotasks()

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'plugin.rejected'))
  expect(rows).toHaveLength(1)
})

test('PATCH reject when owner has no rootCredentials writes no email (OAuth-only owner)', async () => {
  __setProviderForTests(stubProvider())
  const admin = await makeAdmin()
  const owner = await makeUser({ username: 'oauth-owner-r' })
  await makePlugin(owner.id, { id: 'firestore-test', status: 'pending' })

  const res = await patchPlugin('firestore-test', admin, {
    status: 'rejected',
    rejectionReason: 'whatever',
  })
  expect(res.status).toBe(200)

  await flushMicrotasks()

  const rows = await db.select().from(emailLog).where(eq(emailLog.trigger, 'plugin.rejected'))
  expect(rows).toHaveLength(0)
})
