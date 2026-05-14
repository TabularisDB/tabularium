import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, buildApp } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { pluginRequests, pluginRequestClaims } from '../../src/db/schema'

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

describe('POST /api/requests/:id/claim', () => {
  beforeEach(clearDb)

  it('toggles claim and returns updated count', async () => {
    const user = await makeUser()
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: user.username, providerInstanceId: 'github' })
    const requestId = ulid()
    await db.insert(pluginRequests).values({
      id: requestId, slug: 'cassandra', name: 'Cassandra', description: 'Wide-column store', requesterId: user.id, upvotes: 0,
    })

    const app = await buildApp()

    const res1 = await app.handle(
      new Request(`http://localhost/api/requests/${requestId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res1.status).toBe(200)
    const d1 = await res1.json() as { claimed: boolean; claims: number }
    expect(d1.claimed).toBe(true)
    expect(d1.claims).toBe(1)

    const res2 = await app.handle(
      new Request(`http://localhost/api/requests/${requestId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    const d2 = await res2.json() as { claimed: boolean; claims: number }
    expect(d2.claimed).toBe(false)
    expect(d2.claims).toBe(0)
  })

  it('returns 404 for unknown request', async () => {
    const user = await makeUser()
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: user.username, providerInstanceId: 'github' })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/requests/does-not-exist/claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/requests/whatever/claim', { method: 'POST' }),
    )
    expect(res.status).toBe(401)
  })

  it('exposes claims + claimedByMe via GET /api/requests', async () => {
    const user = await makeUser()
    const other = await makeUser({ username: 'other' })
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: user.username, providerInstanceId: 'github' })
    const requestId = ulid()
    await db.insert(pluginRequests).values({
      id: requestId, slug: 'redis', name: 'Redis', description: 'KV', requesterId: user.id, upvotes: 0,
    })
    await db.insert(pluginRequestClaims).values([
      { requestId, userId: user.id },
      { requestId, userId: other.id },
    ])

    const app = await buildApp()
    const resAnon = await app.handle(new Request('http://localhost/api/requests'))
    const dataAnon = await resAnon.json() as { requests: Array<{ id: string; claims: number; claimedByMe: boolean }> }
    expect(dataAnon.requests[0].claims).toBe(2)
    expect(dataAnon.requests[0].claimedByMe).toBe(false)

    const resAuthed = await app.handle(new Request('http://localhost/api/requests', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    const dataAuthed = await resAuthed.json() as { requests: Array<{ claims: number; claimedByMe: boolean }> }
    expect(dataAuthed.requests[0].claims).toBe(2)
    expect(dataAuthed.requests[0].claimedByMe).toBe(true)
  })
})

describe('DELETE /api/admin/requests/:id', () => {
  beforeEach(clearDb)

  it('removes the request and cascades to claims', async () => {
    const admin = await makeUser({ role: 'admin' })
    const claimer = await makeUser({ username: 'claimer' })
    const adminToken = await signJwt({ sub: admin.id, identityId: admin.identityId, username: admin.username, providerInstanceId: 'github' })
    const requestId = ulid()
    await db.insert(pluginRequests).values({
      id: requestId, slug: 'kafka', name: 'Kafka', description: 'Streaming', requesterId: admin.id, upvotes: 0,
    })
    await db.insert(pluginRequestClaims).values({ requestId, userId: claimer.id })

    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/admin/requests/${requestId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    )
    expect(res.status).toBe(204)

    const stillThere = await db.query.pluginRequests.findFirst({ where: { id: requestId } })
    expect(stillThere).toBeUndefined()
    const claimStill = await db.query.pluginRequestClaims.findFirst({ where: { requestId } })
    expect(claimStill).toBeUndefined()
  })

  it('returns 404 for unknown id', async () => {
    const admin = await makeUser({ role: 'admin' })
    const adminToken = await signJwt({ sub: admin.id, identityId: admin.identityId, username: admin.username, providerInstanceId: 'github' })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/requests/missing', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    )
    expect(res.status).toBe(404)
  })

  it('returns 403 for non-admin', async () => {
    const user = await makeUser()
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: user.username, providerInstanceId: 'github' })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/requests/whatever', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(403)
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
