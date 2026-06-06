import { test, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeAdmin, adminHeaders } from '../helpers'
import { setSetting } from '../../src/lib/settings'

beforeEach(clearDb)

test('GET /api/admin/email — empty defaults', async () => {
  const admin = await makeAdmin()
  const app = await buildApp()
  const res = await app.handle(new Request('http://localhost/api/admin/email', { headers: adminHeaders(admin) }))
  expect(res.status).toBe(200)
  const data = (await res.json()) as { provider: string | null }
  expect(data.provider).toBeNull()
})

test('GET /api/admin/email — returns provider and masks encrypted secrets', async () => {
  const admin = await makeAdmin()
  await setSetting('email.provider', 'turbo')
  await setSetting('email.from.default', '"Tabularium" <noreply@tabularis.dev>')
  await setSetting('email.turbo.api_key', 'super-secret', { encrypted: true })
  await setSetting('email.turbo.consumer_key', 'ck-public')
  await setSetting('email.turbo.consumer_secret', 'also-secret', { encrypted: true })
  await setSetting('email.turbo.region', 'global')

  const app = await buildApp()
  const res = await app.handle(new Request('http://localhost/api/admin/email', { headers: adminHeaders(admin) }))
  expect(res.status).toBe(200)
  const data = (await res.json()) as Record<string, any>
  expect(data.provider).toBe('turbo')
  expect(data.from?.default).toBe('"Tabularium" <noreply@tabularis.dev>')
  expect(data.turbo?.consumerKey).toBe('ck-public')
  expect(data.turbo?.apiKeySet).toBe(true)
  expect(data.turbo?.consumerSecretSet).toBe(true)
  expect(JSON.stringify(data)).not.toContain('super-secret')
  expect(JSON.stringify(data)).not.toContain('also-secret')
})

test('PUT /api/admin/email — saves turbo provider with encrypted secret', async () => {
  const admin = await makeAdmin()
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/admin/email', {
      method: 'PUT',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'turbo',
        from: { default: '"Tabularium" <noreply@tabularis.dev>', overrides: {} },
        turbo: { apiKey: 'shhh', consumerKey: 'ck', consumerSecret: 'ss', region: 'eu' },
      }),
    }),
  )
  expect(res.status).toBe(200)
  const view = await app
    .handle(new Request('http://localhost/api/admin/email', { headers: adminHeaders(admin) }))
    .then((r) => r.json() as Promise<Record<string, any>>)
  expect(view.provider).toBe('turbo')
  expect(view.turbo.region).toBe('eu')
  expect(view.turbo.apiKeySet).toBe(true)
  expect(view.turbo.consumerSecretSet).toBe(true)
})

test('PUT /api/admin/email — leaves stored secret intact when omitted', async () => {
  const admin = await makeAdmin()
  await setSetting('email.turbo.api_key', 'original', { encrypted: true })
  const app = await buildApp()
  await app.handle(
    new Request('http://localhost/api/admin/email', {
      method: 'PUT',
      headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'turbo',
        from: { default: 'x', overrides: {} },
        turbo: { consumerKey: 'ck2', region: 'global' },
      }),
    }),
  )
  const { getSetting } = await import('../../src/lib/settings')
  expect(getSetting('email.turbo.api_key')).toBe('original')
})
