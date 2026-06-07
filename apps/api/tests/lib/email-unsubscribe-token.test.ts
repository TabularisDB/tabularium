import { test, expect, beforeEach } from 'bun:test'
import { clearDb, makeUser } from '../helpers'
import {
  initPreferences,
  mintUnsubscribeToken,
  rotateTokenNonce,
  verifyUnsubscribeToken,
  __resetSecretCacheForTests,
} from '../../src/lib/email/unsubscribe-token'
import { deleteSetting } from '../../src/lib/settings'
import { SignJWT } from 'jose'

beforeEach(async () => {
  await clearDb()
  await deleteSetting('email.unsubscribe_secret')
  __resetSecretCacheForTests()
})

test('mint and verify round-trip', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await initPreferences(user.id)
  const token = await mintUnsubscribeToken(user.id)
  const verified = await verifyUnsubscribeToken(token)
  expect(verified?.userId).toBe(user.id)
})

test('rotating the nonce invalidates an old token', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await initPreferences(user.id)
  const token = await mintUnsubscribeToken(user.id)
  await rotateTokenNonce(user.id)
  const verified = await verifyUnsubscribeToken(token)
  expect(verified).toBeNull()
})

test('token signed with a different secret fails', async () => {
  const user = await makeUser({ email: 'u@example.com' })
  await initPreferences(user.id)
  // Mint with our secret to install email_preferences row + nonce
  const _real = await mintUnsubscribeToken(user.id)
  // Forge a token with an attacker-controlled secret
  const fakeSecret = new Uint8Array(32)
  crypto.getRandomValues(fakeSecret)
  const prefs = await import('../../src/db').then(({ db }) =>
    db.query.emailPreferences.findFirst({ where: { userId: user.id } }),
  )
  const forged = await new SignJWT({ scope: 'prefs', nonce: prefs!.tokenNonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('1y')
    .sign(fakeSecret)
  const verified = await verifyUnsubscribeToken(forged)
  expect(verified).toBeNull()
})

test('initPreferences is idempotent — same nonce on repeat calls', async () => {
  const user = await makeUser()
  const first = await initPreferences(user.id, { newsletter: 'instant' })
  const second = await initPreferences(user.id)
  expect(first.tokenNonce).toBe(second.tokenNonce)
  expect(second.prefs.newsletter).toBe('instant')
})
