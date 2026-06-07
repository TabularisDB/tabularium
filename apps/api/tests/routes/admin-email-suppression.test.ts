import { test, expect, beforeEach, afterEach } from 'bun:test'
import { buildApp, clearDb, makeAdmin, adminHeaders } from '../helpers'
import { db } from '../../src/db'
import { emailSuppression } from '../../src/db/schema'
import { setSetting } from '../../src/lib/settings'
import { __setUpstreamDriverForTests } from '../../src/lib/email/suppression-driver'

type ListResponse = {
  rows: Array<{ email: string; source: string; reason: string | null; addedAt: number }>
  total: number
  page: number
  limit: number
}

beforeEach(clearDb)
afterEach(() => {
  __setUpstreamDriverForTests(null)
})

test('GET /api/admin/email/suppression — empty when no rows', async () => {
  const admin = await makeAdmin()
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression', { headers: adminHeaders(admin) }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as ListResponse
  expect(data.rows).toEqual([])
  expect(data.total).toBe(0)
  expect(data.page).toBe(1)
  expect(data.limit).toBe(50)
})

test('GET /api/admin/email/suppression — paginates', async () => {
  const admin = await makeAdmin()
  for (let i = 0; i < 5; i++) {
    await db
      .insert(emailSuppression)
      .values({ email: `bounce${i}@example.test`, source: 'bounce', reason: null })
  }
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression?page=2&limit=2', {
      headers: adminHeaders(admin),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as ListResponse
  expect(data.rows.length).toBe(2)
  expect(data.total).toBe(5)
  expect(data.page).toBe(2)
  expect(data.limit).toBe(2)
})

test('GET /api/admin/email/suppression — filters by source', async () => {
  const admin = await makeAdmin()
  await db.insert(emailSuppression).values({ email: 'b1@example.test', source: 'bounce', reason: null })
  await db.insert(emailSuppression).values({ email: 'b2@example.test', source: 'bounce', reason: null })
  await db.insert(emailSuppression).values({ email: 'm1@example.test', source: 'manual', reason: null })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression?source=manual', {
      headers: adminHeaders(admin),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as ListResponse
  expect(data.rows.length).toBe(1)
  expect(data.rows[0].email).toBe('m1@example.test')
  expect(data.total).toBe(1)
})

test('POST /api/admin/email/suppression — inserts manual row and calls upstream', async () => {
  const admin = await makeAdmin()
  await setSetting('email.provider', 'turbo')
  const driverCalls: { add: Array<{ email: string; reason: string | null }>; remove: Array<{ email: string }> } = {
    add: [],
    remove: [],
  }
  __setUpstreamDriverForTests({
    async add(email, reason) {
      driverCalls.add.push({ email, reason })
    },
    async remove(email) {
      driverCalls.remove.push({ email })
    },
  })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression', {
      method: 'POST',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'Bad@Example.Test', reason: 'manual block' }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; upstreamSynced: boolean }
  expect(data.ok).toBe(true)
  expect(data.upstreamSynced).toBe(true)
  expect(driverCalls.add).toEqual([{ email: 'bad@example.test', reason: 'manual block' }])

  const row = await db.query.emailSuppression.findFirst({ where: { email: 'bad@example.test' } })
  expect(row).toBeTruthy()
  expect(row?.source).toBe('manual')
  expect(row?.reason).toBe('manual block')
})

test('POST /api/admin/email/suppression — local row still inserted when upstream throws', async () => {
  const admin = await makeAdmin()
  await setSetting('email.provider', 'turbo')
  __setUpstreamDriverForTests({
    async add() {
      throw new Error('upstream boom')
    },
    async remove() {},
  })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression', {
      method: 'POST',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'foo@example.test' }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; upstreamSynced: boolean }
  expect(data.ok).toBe(true)
  expect(data.upstreamSynced).toBe(false)

  const row = await db.query.emailSuppression.findFirst({ where: { email: 'foo@example.test' } })
  expect(row).toBeTruthy()
  expect(row?.source).toBe('manual')
})

test('POST /api/admin/email/suppression — no upstream call when provider not turbo', async () => {
  const admin = await makeAdmin()
  // do not configure email.provider; do not set a driver override
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression', {
      method: 'POST',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'no-upstream@example.test' }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; upstreamSynced: boolean }
  expect(data.ok).toBe(true)
  expect(data.upstreamSynced).toBe(false)

  const row = await db.query.emailSuppression.findFirst({
    where: { email: 'no-upstream@example.test' },
  })
  expect(row).toBeTruthy()
})

test('DELETE /api/admin/email/suppression/:email — removes local row and calls upstream', async () => {
  const admin = await makeAdmin()
  await setSetting('email.provider', 'turbo')
  await db.insert(emailSuppression).values({ email: 'drop@example.test', source: 'bounce', reason: null })
  const driverCalls: { add: Array<{ email: string; reason: string | null }>; remove: Array<{ email: string }> } = {
    add: [],
    remove: [],
  }
  __setUpstreamDriverForTests({
    async add(email, reason) {
      driverCalls.add.push({ email, reason })
    },
    async remove(email) {
      driverCalls.remove.push({ email })
    },
  })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression/drop%40example.test', {
      method: 'DELETE',
      headers: adminHeaders(admin),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; upstreamSynced: boolean }
  expect(data.ok).toBe(true)
  expect(data.upstreamSynced).toBe(true)
  expect(driverCalls.remove).toEqual([{ email: 'drop@example.test' }])

  const row = await db.query.emailSuppression.findFirst({ where: { email: 'drop@example.test' } })
  expect(row).toBeUndefined()
})

test('DELETE /api/admin/email/suppression/:email — 404 when no row exists', async () => {
  const admin = await makeAdmin()
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/suppression/missing%40example.test', {
      method: 'DELETE',
      headers: adminHeaders(admin),
    }),
  )
  expect(res.status).toBe(404)
  const data = (await res.json()) as { error: string }
  expect(data.error).toBeTruthy()
})
