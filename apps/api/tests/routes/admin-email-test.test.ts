import { test, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeAdmin, adminHeaders } from '../helpers'
import { __setProviderForTests } from '../../src/lib/email/facade'
import type { EmailProvider } from '../../src/lib/email/types'

beforeEach(clearDb)

test('POST /api/admin/email/test — uses configured provider and returns providerMid', async () => {
  const admin = await makeAdmin()
  const stub: EmailProvider = {
    name: 'stub' as const,
    async send() {
      return { providerMid: 'mid-from-test' }
    },
    async verifyAuth() {
      return { ok: true }
    },
  }
  __setProviderForTests(stub)
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/test', {
      method: 'POST',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ to: 'ops@tabularis.dev', locale: 'en' }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; providerMid: string; logId: string }
  expect(data.ok).toBe(true)
  expect(data.providerMid).toBe('mid-from-test')
  expect(data.logId).toBeTruthy()
})

test('POST /api/admin/email/test — surfaces provider error', async () => {
  const admin = await makeAdmin()
  const stub: EmailProvider = {
    name: 'stub' as const,
    async send() {
      throw new Error('auth revoked')
    },
    async verifyAuth() {
      return { ok: false, reason: 'auth revoked' }
    },
  }
  __setProviderForTests(stub)
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/test', {
      method: 'POST',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ to: 'ops@tabularis.dev', locale: 'en' }),
    }),
  )
  expect(res.status).toBe(422)
  const data = (await res.json()) as { error: string }
  expect(data.error).toContain('auth revoked')
})
