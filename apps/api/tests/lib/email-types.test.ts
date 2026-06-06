import { test, expect } from 'bun:test'
import type { EmailProvider, EmailMessage, EmailTrigger } from '../../src/lib/email/types'

test('EmailProvider interface compiles with a stub impl', () => {
  const stub: EmailProvider = {
    name: 'stub',
    async send(_msg: EmailMessage) {
      return { providerMid: 'stub-mid' }
    },
    async verifyAuth() {
      return { ok: true }
    },
  }
  expect(stub.name).toBe('stub')
})

test('EmailTrigger union includes the three P0 triggers', () => {
  const triggers: EmailTrigger[] = ['account.welcome', 'plugin.approved', 'plugin.rejected']
  expect(triggers).toHaveLength(3)
})
