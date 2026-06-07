import { test, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeUser } from '../helpers'
import {
  mintUnsubscribeToken,
  rotateTokenNonce,
  __resetSecretCacheForTests,
  loadPreferences,
} from '@tabularium/plugin-email'
import { deleteSetting } from '../../src/lib/settings'

beforeEach(async () => {
  await clearDb()
  await deleteSetting('email.unsubscribe_secret')
  __resetSecretCacheForTests()
})

test('GET with valid token returns masked email + defaults', async () => {
  const user = await makeUser({ email: 'someone@example.com' })
  const token = await mintUnsubscribeToken(user.id)
  const app = await buildApp()
  const res = await app.handle(
    new Request(`http://localhost/email/preferences/${token}`),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as {
    email: string | null
    prefs: Record<string, string>
    categories: Array<{ key: string; optIn: boolean }>
  }
  expect(data.email).toBe('s***@example.com')
  expect(data.prefs.account).toBe('instant')
  expect(data.prefs.newsletter).toBe('off')
  expect(data.categories.find((c) => c.key === 'account')?.optIn).toBe(false)
  expect(data.categories.find((c) => c.key === 'newsletter')?.optIn).toBe(true)
})

test('GET with invalid token returns 401', async () => {
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/email/preferences/not-a-real-token'),
  )
  expect(res.status).toBe(401)
})

test('PUT updates prefs and round-trips', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  const token = await mintUnsubscribeToken(user.id)
  const app = await buildApp()
  const res = await app.handle(
    new Request(`http://localhost/email/preferences/${token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefs: { newsletter: 'weekly', plugin_updates: 'daily' } }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { ok: boolean; prefs: Record<string, string> }
  expect(data.ok).toBe(true)
  expect(data.prefs.newsletter).toBe('weekly')
  expect(data.prefs.plugin_updates).toBe('daily')
  // Round-trip via GET
  const get = await app.handle(new Request(`http://localhost/email/preferences/${token}`))
  const got = (await get.json()) as { prefs: Record<string, string> }
  expect(got.prefs.newsletter).toBe('weekly')
  expect(got.prefs.plugin_updates).toBe('daily')
})

test('PUT with rotated nonce returns 401', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  const token = await mintUnsubscribeToken(user.id)
  await rotateTokenNonce(user.id)
  const app = await buildApp()
  const res = await app.handle(
    new Request(`http://localhost/email/preferences/${token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefs: { newsletter: 'weekly' } }),
    }),
  )
  expect(res.status).toBe(401)
})

test('POST with one-click body sets all opt-in to off', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  const token = await mintUnsubscribeToken(user.id)
  const app = await buildApp()
  const res = await app.handle(
    new Request(`http://localhost/email/preferences/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
  )
  expect(res.status).toBe(200)
  const text = await res.text()
  expect(text).toBe('Unsubscribed')
  const after = await loadPreferences(user.id)
  expect(after.account).toBe('instant')
  expect(after.owner_ops).toBe('off')
  expect(after.plugin_updates).toBe('off')
  expect(after.newsletter).toBe('off')
})

test('POST with wrong body returns 400', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  const token = await mintUnsubscribeToken(user.id)
  const app = await buildApp()
  const res = await app.handle(
    new Request(`http://localhost/email/preferences/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'something=else',
    }),
  )
  expect(res.status).toBe(400)
})
