import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, buildApp } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { pluginRequests } from '../../src/db/schema'

describe('GET /api/requests', () => {
  beforeEach(clearDb)

  it('returns empty list', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/requests'))
    expect(res.status).toBe(200)
    const data = await res.json() as { total: number; requests: unknown[] }
    expect(data.total).toBe(0)
  })

  it('sorts by upvotes by default', async () => {
    const user = await makeUser()
    await db.insert(pluginRequests).values([
      { id: ulid(), slug: 'mongo', name: 'MongoDB', description: 'Mongo', requesterId: user.id, upvotes: 5 },
      { id: ulid(), slug: 'mysql', name: 'MySQL', description: 'MySQL', requesterId: user.id, upvotes: 10 },
    ])

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/requests?sort=upvotes'))
    const data = await res.json() as { requests: Array<{ slug: string }> }
    expect(data.requests[0].slug).toBe('mysql')
  })
})

describe('POST /api/requests', () => {
  beforeEach(clearDb)

  it('returns 401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'mongo', name: 'MongoDB', description: 'NoSQL' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('creates a request and returns 409 on duplicate slug', async () => {
    const user = await makeUser()
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: user.username, providerInstanceId: 'github' })
    const app = await buildApp()

    const res1 = await app.handle(
      new Request('http://localhost/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug: 'mongo', name: 'MongoDB', description: 'NoSQL' }),
      }),
    )
    expect(res1.status).toBe(200)

    const res2 = await app.handle(
      new Request('http://localhost/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug: 'mongo', name: 'MongoDB', description: 'NoSQL' }),
      }),
    )
    expect(res2.status).toBe(409)
  })
})

describe('POST /api/requests/:id/upvote', () => {
  beforeEach(clearDb)

  it('toggles upvote and updates count', async () => {
    const user = await makeUser()
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: user.username, providerInstanceId: 'github' })
    const requestId = ulid()
    await db.insert(pluginRequests).values({
      id: requestId, slug: 'elastic', name: 'Elasticsearch', description: 'Search engine', requesterId: user.id, upvotes: 0,
    })

    const app = await buildApp()

    const res1 = await app.handle(
      new Request(`http://localhost/api/requests/${requestId}/upvote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    const d1 = await res1.json() as { upvotes: number; voted: boolean }
    expect(d1.upvotes).toBe(1)
    expect(d1.voted).toBe(true)

    const res2 = await app.handle(
      new Request(`http://localhost/api/requests/${requestId}/upvote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    const d2 = await res2.json() as { upvotes: number; voted: boolean }
    expect(d2.upvotes).toBe(0)
    expect(d2.voted).toBe(false)
  })
})
