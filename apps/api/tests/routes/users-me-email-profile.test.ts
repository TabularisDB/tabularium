import { test, expect, beforeEach } from 'bun:test'
import { db } from '../../src/db'
import { buildApp, clearDb, makeUser, userHeaders } from '../helpers'
import { initPreferences } from '@tabularium/plugin-email'

beforeEach(clearDb)

test('GET returns current email + locale', async () => {
  const user = await makeUser({ email: 'u@example.com', locale: 'de' })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/users/me/email-profile', { headers: userHeaders(user) }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { email: string | null; locale: string }
  expect(data.email).toBe('u@example.com')
  expect(data.locale).toBe('de')
})

test('PATCH updates email and rotates token nonce', async () => {
  const user = await makeUser({ email: 'old@example.com' })
  await initPreferences(user.id)
  const prev = await db.query.emailPreferences.findFirst({ where: { userId: user.id } })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/users/me/email-profile', {
      method: 'PATCH',
      headers: { ...userHeaders(user), 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' }),
    }),
  )
  expect(res.status).toBe(200)
  const data = (await res.json()) as { email: string | null; locale: string }
  expect(data.email).toBe('new@example.com')
  const after = await db.query.emailPreferences.findFirst({ where: { userId: user.id } })
  expect(after?.tokenNonce).not.toBe(prev?.tokenNonce)
})

test('PATCH locale only does not rotate the nonce', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await initPreferences(user.id)
  const prev = await db.query.emailPreferences.findFirst({ where: { userId: user.id } })
  const app = await buildApp()
  await app.handle(
    new Request('http://localhost/api/users/me/email-profile', {
      method: 'PATCH',
      headers: { ...userHeaders(user), 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'fr' }),
    }),
  )
  const after = await db.query.emailPreferences.findFirst({ where: { userId: user.id } })
  expect(after?.tokenNonce).toBe(prev?.tokenNonce)
})

test('PATCH with duplicate email returns 409', async () => {
  await makeUser({ email: 'taken@example.com', username: 'a' })
  const user = await makeUser({ email: 'mine@example.com', username: 'b' })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/users/me/email-profile', {
      method: 'PATCH',
      headers: { ...userHeaders(user), 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'taken@example.com' }),
    }),
  )
  expect(res.status).toBe(409)
})

test('PATCH with invalid email format returns 422', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/users/me/email-profile', {
      method: 'PATCH',
      headers: { ...userHeaders(user), 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    }),
  )
  expect([400, 422]).toContain(res.status)
})

test('PATCH email=null clears the address', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await initPreferences(user.id)
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/api/users/me/email-profile', {
      method: 'PATCH',
      headers: { ...userHeaders(user), 'content-type': 'application/json' },
      body: JSON.stringify({ email: null }),
    }),
  )
  expect(res.status).toBe(200)
  const row = await db.query.users.findFirst({ where: { id: user.id } })
  expect(row?.email).toBeNull()
})
