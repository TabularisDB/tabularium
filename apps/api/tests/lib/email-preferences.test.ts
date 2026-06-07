import { test, expect, beforeEach } from 'bun:test'
import { db } from '../../src/db'
import { clearDb, makeUser } from '../helpers'
import { emailPreferences } from '../../src/db/schema'
import {
  loadPreferences,
  savePreferences,
  unsubscribeAllOptIn,
  DEFAULT_PREFERENCES,
} from '@tabularium/plugin-email'

beforeEach(clearDb)

test('loadPreferences returns defaults when no row exists', async () => {
  const user = await makeUser()
  const prefs = await loadPreferences(user.id)
  expect(prefs).toEqual({ ...DEFAULT_PREFERENCES })
})

test('loadPreferences merges stored partial onto defaults', async () => {
  const user = await makeUser()
  // Insert partial prefs directly so we can verify merging
  await db.insert(emailPreferences).values({
    userId: user.id,
    prefs: JSON.stringify({ newsletter: 'weekly' }),
    tokenNonce: 'nonce-test',
  })
  const prefs = await loadPreferences(user.id)
  expect(prefs.newsletter).toBe('weekly')
  expect(prefs.account).toBe(DEFAULT_PREFERENCES.account)
  expect(prefs.owner_ops).toBe(DEFAULT_PREFERENCES.owner_ops)
  expect(prefs.plugin_updates).toBe(DEFAULT_PREFERENCES.plugin_updates)
})

test('savePreferences initializes prefs row + nonce on first save', async () => {
  const user = await makeUser()
  const before = await db.query.emailPreferences.findFirst({ where: { userId: user.id } })
  expect(before).toBeUndefined()
  const next = await savePreferences(user.id, { newsletter: 'daily' })
  expect(next.newsletter).toBe('daily')
  const after = await db.query.emailPreferences.findFirst({ where: { userId: user.id } })
  expect(after).toBeDefined()
  expect(after?.tokenNonce.length).toBeGreaterThan(0)
})

test('savePreferences cannot turn off account (transactional always-on)', async () => {
  const user = await makeUser()
  const next = await savePreferences(user.id, {
    account: 'off',
    newsletter: 'instant',
  })
  expect(next.account).toBe('instant')
  expect(next.newsletter).toBe('instant')
  // Round-trip through load too
  const reloaded = await loadPreferences(user.id)
  expect(reloaded.account).toBe('instant')
})

test('unsubscribeAllOptIn turns opt-in categories off and leaves account alone', async () => {
  const user = await makeUser()
  await savePreferences(user.id, {
    owner_ops: 'instant',
    plugin_updates: 'instant',
    newsletter: 'instant',
  })
  const next = await unsubscribeAllOptIn(user.id)
  expect(next.account).toBe('instant')
  expect(next.owner_ops).toBe('off')
  expect(next.plugin_updates).toBe('off')
  expect(next.newsletter).toBe('off')
})
