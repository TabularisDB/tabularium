import { test, expect, beforeEach } from 'bun:test'
import { clearDb, makeUser } from '../helpers'
import { sendEmail, __setProviderForTests, verifyUnsubscribeToken } from '@tabularium/plugin-email'
import type { EmailMessage, EmailProvider } from '@tabularium/plugin-email/types'

let captured: EmailMessage | null = null
const stub: EmailProvider = {
  name: 'stub' as const,
  async send(msg) {
    captured = msg
    return { providerMid: 'mid-x' }
  },
  async verifyAuth() {
    return { ok: true }
  },
}

beforeEach(async () => {
  await clearDb()
  __setProviderForTests(stub)
  captured = null
})

test('opt-in trigger gets List-Unsubscribe + List-Unsubscribe-Post headers', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await sendEmail({
    trigger: 'plugin.approved', // owner_ops (opt-in)
    user: { id: user.id, email: 'u@example.com', locale: 'en' },
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
  })
  expect(captured?.headers).toBeDefined()
  const lu = captured!.headers!['List-Unsubscribe']
  expect(lu).toMatch(/^<https?:\/\//)
  expect(lu).toContain('/email/unsubscribe/')
  expect(lu).toContain(`mailto:unsubscribe+${user.id}@`)
  expect(captured!.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')

  // The URL token must verify back to the user:
  const url = lu.match(/<(https?:\/\/[^>]+)>/)![1]
  const token = url.split('/email/unsubscribe/')[1]
  const verified = await verifyUnsubscribeToken(token)
  expect(verified?.userId).toBe(user.id)
})

test('transactional account.welcome does NOT get List-Unsubscribe', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await sendEmail({
    trigger: 'account.welcome',
    user: { id: user.id, email: 'u@example.com', locale: 'en' },
    vars: { username: 'u', baseUrl: 'https://t.dev' },
  })
  expect(captured?.headers).toBeUndefined()
})

test('force: true mail does NOT get List-Unsubscribe', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await sendEmail({
    trigger: 'plugin.approved',
    user: { id: user.id, email: 'u@example.com', locale: 'en' },
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
    force: true,
  })
  expect(captured?.headers).toBeUndefined()
})

test('mail to anonymous "to" (no user) does NOT get List-Unsubscribe', async () => {
  await sendEmail({
    trigger: 'plugin.approved',
    to: 'ops@tabularis.dev',
    vars: { pluginName: 'x', pluginSlug: 'x', baseUrl: 'https://t.dev' },
  })
  expect(captured?.headers).toBeUndefined()
})
