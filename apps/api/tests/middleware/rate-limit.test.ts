import { describe, it, expect, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { rateLimit } from '../../src/middleware/rate-limit'
import { initCache, resetCacheForTests } from '../../src/lib/cache'

function buildApp(limit: number, windowSeconds: number) {
  return new Elysia()
    .use(rateLimit({
      bucket: 'test',
      limit,
      windowSeconds,
      keyFn: ({ request }) => request.headers.get('x-test-subject') ?? 'shared',
    }))
    .post('/p', () => ({ ok: true }))
}

function req(subject = 'default') {
  return new Request('http://localhost/p', {
    method: 'POST',
    headers: { 'x-test-subject': subject },
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

  it('tracks separate buckets per subject', async () => {
    const app = buildApp(1, 60)
    expect((await app.handle(req('alice'))).status).toBe(200)
    expect((await app.handle(req('bob'))).status).toBe(200)
    expect((await app.handle(req('alice'))).status).toBe(429)
  })
})
