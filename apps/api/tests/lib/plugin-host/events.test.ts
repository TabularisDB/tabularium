import { beforeEach, expect, test } from 'bun:test'
import { Bus } from '../../../src/lib/plugin-host/events'

let bus: Bus

beforeEach(() => {
  bus = new Bus()
})

const flush = () => new Promise((r) => setTimeout(r, 5))

test('emit invokes a registered handler with the payload', async () => {
  const seen: string[] = []
  bus.on('account.welcome', (p) => {
    seen.push(p.username)
  })
  bus.emit('account.welcome', {
    user: { id: 'u1', email: 'a@b', locale: 'en' },
    username: 'alice',
  })
  await flush()
  expect(seen).toEqual(['alice'])
})

test('multiple handlers all run on a single emit', async () => {
  let a = 0
  let b = 0
  let c = 0
  bus.on('account.welcome', () => {
    a++
  })
  bus.on('account.welcome', () => {
    b++
  })
  bus.on('account.welcome', () => {
    c++
  })
  bus.emit('account.welcome', {
    user: { id: 'u', email: 'a@b', locale: 'en' },
    username: 'x',
  })
  await flush()
  expect([a, b, c]).toEqual([1, 1, 1])
})

test('one handler throws but other handlers still run', async () => {
  let ranAfter = 0
  bus.on('account.welcome', () => {
    throw new Error('boom')
  })
  bus.on('account.welcome', () => {
    ranAfter++
  })
  bus.emit('account.welcome', {
    user: { id: 'u', email: 'a@b', locale: 'en' },
    username: 'x',
  })
  await flush()
  expect(ranAfter).toBe(1)
})

test('on returns an unsubscribe function', async () => {
  let count = 0
  const off = bus.on('account.welcome', () => {
    count++
  })
  bus.emit('account.welcome', {
    user: { id: 'u', email: 'a@b', locale: 'en' },
    username: 'x',
  })
  await flush()
  expect(count).toBe(1)
  off()
  bus.emit('account.welcome', {
    user: { id: 'u', email: 'a@b', locale: 'en' },
    username: 'x',
  })
  await flush()
  expect(count).toBe(1)
})

test('emit with no handlers is a no-op (does not throw)', async () => {
  expect(() =>
    bus.emit('account.welcome', {
      user: { id: 'u', email: 'a@b', locale: 'en' },
      username: 'x',
    }),
  ).not.toThrow()
})

test('async handler is awaited before swallowing errors', async () => {
  let resolved = false
  bus.on('account.welcome', async () => {
    await new Promise((r) => setTimeout(r, 1))
    resolved = true
  })
  bus.emit('account.welcome', {
    user: { id: 'u', email: 'a@b', locale: 'en' },
    username: 'x',
  })
  await flush()
  expect(resolved).toBe(true)
})
