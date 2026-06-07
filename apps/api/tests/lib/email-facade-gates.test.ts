import { test, expect, beforeEach } from 'bun:test'
import { db } from '../../src/db'
import { emailSuppression } from '../../src/db/schema'
import { clearDb, makeUser } from '../helpers'
import { sendEmail, __setProviderForTests } from '../../src/lib/email/facade'
import { savePreferences } from '../../src/lib/email/preferences'
import type { EmailBucket, EmailProvider } from '../../src/lib/email/types'

const stub: EmailProvider = {
  name: 'stub' as const,
  async send() {
    return { providerMid: 'mid-x' }
  },
  async verifyAuth() {
    return { ok: true }
  },
}

beforeEach(async () => {
  await clearDb()
  __setProviderForTests(stub)
})

test('suppressed recipient short-circuits to status=suppressed', async () => {
  const user = await makeUser({ email: 'blocked@example.com' })
  await db.insert(emailSuppression).values({ email: 'blocked@example.com', source: 'bounce' })
  const out = await sendEmail({
    trigger: 'plugin.approved',
    user: { id: user.id, email: 'blocked@example.com', locale: 'en' },
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
  })
  expect(out.status).toBe('suppressed')
  if (out.status === 'suppressed') expect(out.reason).toBe('bounce')
  const row = await db.query.emailLog.findFirst({ where: { id: out.logId } })
  expect(row?.status).toBe('suppressed')
  expect(row?.error).toContain('bounce')
})

test('force: true bypasses suppression', async () => {
  const user = await makeUser({ email: 'blocked@example.com' })
  await db.insert(emailSuppression).values({ email: 'blocked@example.com', source: 'bounce' })
  const out = await sendEmail({
    trigger: 'plugin.approved',
    user: { id: user.id, email: 'blocked@example.com', locale: 'en' },
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
    force: true,
  })
  expect(out.status).toBe('sent')
})

test('preference off short-circuits opt-in trigger to suppressed', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await savePreferences(user.id, { owner_ops: 'off' })
  const out = await sendEmail({
    trigger: 'plugin.approved',
    user: { id: user.id, email: 'u@example.com', locale: 'en' },
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
  })
  expect(out.status).toBe('suppressed')
  if (out.status === 'suppressed') expect(out.reason).toBe('preference:off')
})

test('preference daily/weekly maps to queued (stub)', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await savePreferences(user.id, { owner_ops: 'daily' })
  const out = await sendEmail({
    trigger: 'plugin.approved',
    user: { id: user.id, email: 'u@example.com', locale: 'en' },
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
  })
  expect(out.status).toBe('queued')
})

test('preference cannot suppress transactional account.welcome', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  // savePreferences enforces account=instant, but even an attempt to set
  // it to 'off' must not block welcome:
  await savePreferences(user.id, { account: 'off' as EmailBucket })
  const out = await sendEmail({
    trigger: 'account.welcome',
    user: { id: user.id, email: 'u@example.com', locale: 'en' },
    vars: { username: 'u', baseUrl: 'https://t.dev' },
  })
  expect(out.status).toBe('sent')
})

test('preference off + force: true sends anyway', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await savePreferences(user.id, { owner_ops: 'off' })
  const out = await sendEmail({
    trigger: 'plugin.approved',
    user: { id: user.id, email: 'u@example.com', locale: 'en' },
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
    force: true,
  })
  expect(out.status).toBe('sent')
})
