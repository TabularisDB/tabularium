import { test, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeUser, userHeaders } from '../helpers'
import { DEFAULT_PREFERENCES } from '../../src/lib/email/types'

beforeEach(clearDb)

test('GET (cookie-authed) returns defaults', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/users/me/email-preferences', {
      headers: userHeaders(user),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { prefs: Record<string, string> }
  expect(data.prefs.account).toBe(DEFAULT_PREFERENCES.account)
  expect(data.prefs.newsletter).toBe(DEFAULT_PREFERENCES.newsletter)
})

test('PUT updates prefs', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/users/me/email-preferences', {
      method: 'PUT',
      headers: { ...userHeaders(user), 'content-type': 'application/json' },
      body: JSON.stringify({ prefs: { newsletter: 'daily', plugin_updates: 'weekly' } }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; prefs: Record<string, string> }
  expect(data.ok).toBe(true)
  expect(data.prefs.newsletter).toBe('daily')
  expect(data.prefs.plugin_updates).toBe('weekly')
  // account always-on
  expect(data.prefs.account).toBe('instant')

  // Round-trip
  const get = await app.handle(
    new Request('http://localhost/api/users/me/email-preferences', {
      headers: userHeaders(user),
    }),
  )
  const got = (await get.json()) as { prefs: Record<string, string> }
  expect(got.prefs.newsletter).toBe('daily')
  expect(got.prefs.plugin_updates).toBe('weekly')
})
