import { test, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeAdmin, adminHeaders } from '../helpers'
import { hasSetting, getSetting } from '../../src/lib/settings'
import { __setBootstrapClientForTests } from '../../src/routes/api/admin/email/bootstrap'

beforeEach(clearDb)

test('bootstrap stores apiKey + creates consumer key + discards password', async () => {
  const admin = await makeAdmin()

  let observedPassword: string | undefined
  __setBootstrapClientForTests({
    async authorize(_email, password, _region) {
      observedPassword = password
      return { auth: 'api-key-from-server' }
    },
    async listConsumerKeys(_apiKey, _region) {
      return [{ label: 'tabularium', consumer_key: 'old-ck' }]
    },
    async deleteConsumerKey(_apiKey, _key, _region) {
      return { ok: true }
    },
    async createConsumerKey(_apiKey, _label, _region) {
      return { consumer_key: 'new-ck', consumer_secret: 'new-cs' }
    },
    async sendTestMail(_apiKey, _ck, _cs, _region, _to, _from) {
      return { mid: 'test-mid-1' }
    },
  })

  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email/bootstrap', {
      method: 'POST',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@tabularis.dev',
        password: 'corr-horse-battery',
        region: 'global',
      }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; testMid: string }
  expect(data.ok).toBe(true)
  expect(data.testMid).toBe('test-mid-1')

  expect(hasSetting('email.turbo.api_key')).toBe(true)
  expect(getSetting('email.turbo.consumer_key')).toBe('new-ck')
  expect(hasSetting('email.turbo.consumer_secret')).toBe(true)
  expect(getSetting('email.turbo.region')).toBe('global')

  expect(observedPassword).toBe('corr-horse-battery')
  const { listSettings } = await import('../../src/lib/settings')
  const all = await listSettings()
  const concatenated = JSON.stringify(all)
  expect(concatenated).not.toContain('corr-horse-battery')
})
