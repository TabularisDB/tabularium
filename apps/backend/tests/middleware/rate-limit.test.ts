import { describe, it, expect, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { rateLimit } from '../../src/middleware/rate-limit'
import { initCache, resetCacheForTests } from '../../src/lib/cache'

function buildApp(limit: number, windowSeconds: number) {
  return new Elysia()
    .use(rateLimit({ bucket: 'test', limit, windowSeconds }))
    .post('/p', () => ({ ok: true }))
}

function req(ip = '1.2.3.4') {
  return new Request('http://localhost/p', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  })
}

describe('rateLimit middleware', () => {
  beforeEach(() => {
    resetCacheForTests()
    initCache()
  })

  it('allows requests under the limit', async () => {
    const app = buildApp(3, 60)
    for (let i = 0; i < 3; i++) {
      const res = await app.handle(req())
      expect(res.status).toBe(200)
    }
  })

  it('returns 429 once the limit is exceeded', async () => {
    const app = buildApp(2, 60)
    expect((await app.handle(req())).status).toBe(200)
    expect((await app.handle(req())).status).toBe(200)
    const blocked = await app.handle(req())
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('60')
  })

  it('tracks separate buckets per IP', async () => {
    const app = buildApp(1, 60)
    expect((await app.handle(req('1.1.1.1'))).status).toBe(200)
    expect((await app.handle(req('2.2.2.2'))).status).toBe(200)
    expect((await app.handle(req('1.1.1.1'))).status).toBe(429)
  })
})
