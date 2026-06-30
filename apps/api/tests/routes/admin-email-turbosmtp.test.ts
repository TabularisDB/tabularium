import { test, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeAdmin, adminHeaders } from '../helpers'

beforeEach(clearDb)

/**
 * These tests only exercise the "not configured" / auth-gate paths so the
 * suite never reaches out to the real TurboSMTP API. End-to-end behavior is
 * verified manually against a live account during the release smoke test.
 */
test('GET /api/admin/email/turbosmtp/stats — 412 when not configured', async () => {
  const admin = await makeAdmin()
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/turbosmtp/stats', {
      headers: adminHeaders(admin),
    }),
  )
  expect(res.status).toBe(412)
  const data = (await res.json()) as { error: string }
  expect(data.error).toContain('not configured')
})

test('GET /api/admin/email/turbosmtp/consumer-keys — 412 when not configured', async () => {
  const admin = await makeAdmin()
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/turbosmtp/consumer-keys', {
      headers: adminHeaders(admin),
    }),
  )
  expect(res.status).toBe(412)
})

test('POST /api/admin/email/turbosmtp/test-connection — 412 when not configured', async () => {
  const admin = await makeAdmin()
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/turbosmtp/test-connection', {
      method: 'POST',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  expect(res.status).toBe(412)
  const data = (await res.json()) as { error: string }
  expect(data.error.toLowerCase()).toContain('not')
})

test('admin routes reject unauthenticated requests', async () => {
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/turbosmtp/stats'),
  )
  expect([401, 403]).toContain(res.status)
})
