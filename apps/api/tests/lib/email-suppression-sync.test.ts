import { test, expect, beforeEach } from 'bun:test'
import { db } from '../../src/db'
import { emailSuppression } from '../../src/db/schema'
import { clearDb } from '../helpers'
import {
  syncOnce,
  __setSyncDriverForTests,
  type SuppressionDriver,
} from '../../src/lib/email/suppression-sync'

beforeEach(async () => {
  await clearDb()
  __setSyncDriverForTests(null)
})

test('syncOnce inserts new suppressions', async () => {
  const driver: SuppressionDriver = {
    async list() {
      return [
        { email: 'a@example.com', source: 'bounce', reason: '550 mailbox full' },
        { email: 'b@example.com', source: 'spam', reason: 'reported' },
        { email: 'c@example.com', source: 'validation_failed', reason: 'mx missing' },
      ]
    },
  }
  __setSyncDriverForTests(driver)
  const out = await syncOnce()
  expect(out.checked).toBe(3)
  const all = await db.select().from(emailSuppression)
  expect(all).toHaveLength(3)
  const byEmail = Object.fromEntries(all.map((r) => [r.email, r.source]))
  expect(byEmail['a@example.com']).toBe('bounce')
  expect(byEmail['b@example.com']).toBe('complaint')
  expect(byEmail['c@example.com']).toBe('bounce')
})

test('syncOnce is idempotent — no duplicates on second tick', async () => {
  const driver: SuppressionDriver = {
    async list() {
      return [{ email: 'x@example.com', source: 'bounce', reason: null }]
    },
  }
  __setSyncDriverForTests(driver)
  await syncOnce()
  await syncOnce()
  const all = await db.select().from(emailSuppression)
  expect(all).toHaveLength(1)
})

test('syncOnce with no driver returns zeros', async () => {
  const out = await syncOnce()
  expect(out).toEqual({ added: 0, checked: 0 })
})

test('upstream recipient is lowercased on insert', async () => {
  const driver: SuppressionDriver = {
    async list() {
      return [{ email: 'A@Example.com', source: 'bounce', reason: null }]
    },
  }
  __setSyncDriverForTests(driver)
  await syncOnce()
  const all = await db.select().from(emailSuppression)
  expect(all).toHaveLength(1)
  expect(all[0]?.email).toBe('a@example.com')
})
