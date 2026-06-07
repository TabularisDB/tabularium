import { test, expect, beforeEach } from 'bun:test'
import { db } from '../../src/db'
import { emailLog } from '../../src/db/schema'
import { clearDb, makeUser } from '../helpers'
import { sendEmail, __setProviderForTests } from '@tabularium/plugin-email'
import type { EmailProvider } from '@tabularium/plugin-email/types'

beforeEach(clearDb)

function stubProvider(opts: { send?: (msg: any) => Promise<{ providerMid: string | null }> } = {}): EmailProvider {
  return {
    name: 'stub' as const,
    async send(msg) {
      return opts.send ? opts.send(msg) : { providerMid: 'stub-mid-1' }
    },
    async verifyAuth() {
      return { ok: true }
    },
  }
}

test('sendEmail with no provider configured writes a queued row and returns queued', async () => {
  __setProviderForTests(null)
  const user = await makeUser()
  const out = await sendEmail({
    trigger: 'account.welcome',
    user: { id: user.id, email: 'a@x.com', locale: 'en' },
    vars: { username: 'alice', baseUrl: 'https://tabularis.dev' },
  })
  expect(out.status).toBe('queued')
  const row = await db.query.emailLog.findFirst({ where: { id: out.logId } })
  expect(row?.status).toBe('queued')
  expect(row?.toAddress).toBe('a@x.com')
})

test('sendEmail dispatches through the configured provider and logs sent', async () => {
  __setProviderForTests(stubProvider())
  const user = await makeUser()
  const out = await sendEmail({
    trigger: 'plugin.approved',
    user: { id: user.id, email: 'owner@x.com', locale: 'en' },
    vars: { pluginName: 'firestore', pluginSlug: 'firestore', baseUrl: 'https://tabularis.dev' },
  })
  expect(out.status).toBe('sent')
  if (out.status === 'sent') expect(out.providerMid).toBe('stub-mid-1')
  const row = await db.query.emailLog.findFirst({ where: { id: out.logId } })
  expect(row?.status).toBe('sent')
  expect(row?.providerMid).toBe('stub-mid-1')
})

test('sendEmail records failure when provider throws', async () => {
  __setProviderForTests(
    stubProvider({
      send: async () => {
        throw new Error('upstream rate limit')
      },
    }),
  )
  const user = await makeUser()
  const out = await sendEmail({
    trigger: 'plugin.rejected',
    user: { id: user.id, email: 'owner@x.com', locale: 'en' },
    vars: { pluginName: 'firestore', pluginSlug: 'firestore', reason: 'broken zip', baseUrl: 'https://tabularis.dev' },
  })
  expect(out.status).toBe('failed')
  const row = await db.query.emailLog.findFirst({ where: { id: out.logId } })
  expect(row?.status).toBe('failed')
  expect(row?.error).toContain('upstream rate limit')
})

test('sendEmail respects an explicit `to` for system mails without a user', async () => {
  __setProviderForTests(stubProvider())
  const out = await sendEmail({
    trigger: 'account.welcome',
    to: 'ops@tabularis.dev',
    vars: { username: 'ops', baseUrl: 'https://tabularis.dev' },
  })
  expect(out.status).toBe('sent')
  const row = await db.query.emailLog.findFirst({ where: { id: out.logId } })
  expect(row?.toAddress).toBe('ops@tabularis.dev')
  expect(row?.userId).toBeNull()
})
