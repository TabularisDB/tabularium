import { describe, it, expect, beforeEach } from 'bun:test'
import { initCache, cache, resetCacheForTests } from '../../src/lib/cache'

describe('memory cache', () => {
  beforeEach(() => {
    resetCacheForTests()
    initCache()
  })

  it('returns null for missing keys', async () => {
    expect(await cache().get('missing')).toBeNull()
  })

  it('round-trips an object', async () => {
    await cache().set('k', { a: 1, b: 'two' })
    expect(await cache().get('k')).toEqual({ a: 1, b: 'two' })
  })

  it('expires entries after ttl', async () => {
    await cache().set('k', 'v', 0.05)
    expect(await cache().get('k')).toBe('v')
    await new Promise((r) => setTimeout(r, 80))
    expect(await cache().get('k')).toBeNull()
  })

  it('del removes the entry', async () => {
    await cache().set('k', 'v')
    await cache().del('k')
    expect(await cache().get('k')).toBeNull()
  })

  it('incr increments and respects ttl on first set', async () => {
    expect(await cache().incr('counter', 0.1)).toBe(1)
    expect(await cache().incr('counter', 0.1)).toBe(2)
    expect(await cache().incr('counter', 0.1)).toBe(3)
    await new Promise((r) => setTimeout(r, 150))
    expect(await cache().incr('counter', 0.1)).toBe(1)
  })
})
