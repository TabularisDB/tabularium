import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import {
  clearDb,
  makeUser,
  makeAdmin,
  makePlugin,
  buildApp,
  userHeaders,
  adminHeaders,
  type TestUser,
} from '../helpers'
import { db } from '../../src/db'
import { pluginRequests, webhooks } from '../../src/db/schema'

type View = {
  id: string
  slug: string
  status: string
  bounty: Record<string, unknown> | null
  claims: number
  claimers: Array<{ userId: string; username: string | null; avatarUrl: string | null }>
  claimedByMe: boolean
  votedByMe: boolean
  fulfilledPlugin: { id: string; name: string } | null
}

async function seedRequest(requester: TestUser, overrides: Partial<typeof pluginRequests.$inferInsert> = {}) {
  const row = {
    id: ulid(),
    slug: 'firebird',
    name: 'Firebird',
    description: 'Firebird driver',
    requesterId: requester.id,
    ...overrides,
  }
  await db.insert(pluginRequests).values(row)
  return row
}

async function call(path: string, init: RequestInit = {}) {
  const app = await buildApp()
  return app.handle(new Request(`http://localhost${path}`, init))
}

function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }
}

describe('request visibility', () => {
  beforeEach(clearDb)

  it('hides pending and rejected requests from anonymous viewers', async () => {
    const user = await makeUser()
    await seedRequest(user, { slug: 'a', status: 'pending' })
    await seedRequest(user, { slug: 'b', status: 'rejected' })
    await seedRequest(user, { slug: 'c', status: 'approved' })
    await seedRequest(user, { slug: 'd', status: 'fulfilled' })

    const res = await call('/api/requests?status=pending,rejected,approved,fulfilled')
    const data = (await res.json()) as { total: number; requests: View[] }
    expect(data.requests.map((r) => r.slug).sort()).toEqual(['c', 'd'])
    expect(data.total).toBe(2)
  })

  it('shows pending requests to their requester and to admins only', async () => {
    const owner = await makeUser({ username: 'owner' })
    const other = await makeUser({ username: 'other' })
    const admin = await makeAdmin()
    await seedRequest(owner, { slug: 'mine', status: 'pending' })

    const ownList = (await (await call('/api/requests?status=pending', { headers: userHeaders(owner) })).json()) as {
      total: number
    }
    expect(ownList.total).toBe(1)
    const otherList = (await (await call('/api/requests?status=pending', { headers: userHeaders(other) })).json()) as {
      total: number
    }
    expect(otherList.total).toBe(0)
    const adminList = (await (await call('/api/requests?status=pending', { headers: adminHeaders(admin) })).json()) as {
      total: number
    }
    expect(adminList.total).toBe(1)

    expect((await call('/api/requests/mine')).status).toBe(404)
    expect((await call('/api/requests/mine', { headers: userHeaders(other) })).status).toBe(404)
    expect((await call('/api/requests/mine', { headers: userHeaders(owner) })).status).toBe(200)
    expect((await call('/api/requests/mine', { headers: adminHeaders(admin) })).status).toBe(200)
  })

  it('reads a single request by id or slug', async () => {
    const user = await makeUser()
    const row = await seedRequest(user, { status: 'approved' })
    const bySlug = (await (await call('/api/requests/firebird')).json()) as View
    const byId = (await (await call(`/api/requests/${row.id}`)).json()) as View
    expect(bySlug.id).toBe(row.id)
    expect(byId.slug).toBe('firebird')
  })
})

describe('PATCH /api/admin/requests/:id', () => {
  beforeEach(clearDb)

  it('approves a request with bounty metadata and emits request.approved', async () => {
    const user = await makeUser()
    const admin = await makeAdmin()
    const row = await seedRequest(user)
    await db.insert(webhooks).values({
      id: ulid(),
      name: 'all',
      events: JSON.stringify(['request.approved']),
      url: 'https://hooks.example.com/x',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const bounty = {
      boardStatus: 'most-wanted',
      tagline: 'Legacy SQL, modern client.',
      difficulty: 'High',
      accent: '#ff5a3d',
      capabilities: [{ label: 'connect', state: 'needed' }],
    }
    const res = await call(`/api/admin/requests/${row.id}`, json({ status: 'approved', bounty }, adminHeaders(admin)))
    expect(res.status).toBe(200)
    const view = (await res.json()) as View
    expect(view.status).toBe('approved')
    expect(view.bounty).toEqual(bounty)

    const stored = await db.query.pluginRequests.findFirst({ where: { id: row.id } })
    expect(stored?.reviewedBy).toBe(admin.id)
    const deliveries = await db.query.webhookDeliveries.findMany()
    expect(deliveries.map((d) => d.event)).toEqual(['request.approved'])
  })

  it('rejects invalid bounty metadata', async () => {
    const user = await makeUser()
    const admin = await makeAdmin()
    const row = await seedRequest(user)
    const res = await call(
      `/api/admin/requests/${row.id}`,
      json({ bounty: { accent: 'red', difficulty: 'Impossible' } }, adminHeaders(admin)),
    )
    expect(res.status).toBe(422)
  })

  it('stores the rejection reason', async () => {
    const user = await makeUser()
    const admin = await makeAdmin()
    const row = await seedRequest(user)
    const res = await call(
      `/api/admin/requests/${row.id}`,
      json({ status: 'rejected', rejectionReason: 'Duplicate of mongodb' }, adminHeaders(admin)),
    )
    expect(((await res.json()) as { rejectionReason: string }).rejectionReason).toBe('Duplicate of mongodb')
  })

  it('refuses to mark fulfilled without a matching plugin', async () => {
    const user = await makeUser()
    const admin = await makeAdmin()
    const row = await seedRequest(user, { status: 'approved' })
    const res = await call(`/api/admin/requests/${row.id}`, json({ status: 'fulfilled' }, adminHeaders(admin)))
    expect(res.status).toBe(400)
  })

  it('is admin only', async () => {
    const user = await makeUser()
    const row = await seedRequest(user)
    const res = await call(`/api/admin/requests/${row.id}`, json({ status: 'approved' }, userHeaders(user)))
    expect(res.status).toBe(403)
  })
})

describe('claims and votes on the lifecycle', () => {
  beforeEach(clearDb)

  it('only takes new claims and votes on approved requests', async () => {
    const user = await makeUser()
    const row = await seedRequest(user, { status: 'pending' })
    const post = { method: 'POST', headers: userHeaders(user) }
    expect((await call(`/api/requests/${row.id}/claim`, post)).status).toBe(409)
    expect((await call(`/api/requests/${row.id}/upvote`, post)).status).toBe(409)
  })

  it('lists claimers with GitHub avatars and fills votedByMe', async () => {
    const user = await makeUser({ username: 'builder', externalId: '4242' })
    const row = await seedRequest(user, { status: 'approved' })
    const post = { method: 'POST', headers: userHeaders(user) }

    const claim = (await (await call(`/api/requests/${row.id}/claim`, post)).json()) as {
      claimed: boolean
      claimers: View['claimers']
    }
    expect(claim.claimed).toBe(true)
    expect(claim.claimers).toHaveLength(1)
    expect(claim.claimers[0]).toMatchObject({
      username: 'builder',
      avatarUrl: 'https://avatars.githubusercontent.com/u/4242?v=4',
    })
    await call(`/api/requests/${row.id}/upvote`, post)

    const view = (await (await call('/api/requests/firebird', { headers: userHeaders(user) })).json()) as View
    expect(view).toMatchObject({ claims: 1, claimedByMe: true, votedByMe: true })
    const anon = (await (await call('/api/requests/firebird')).json()) as View
    expect(anon).toMatchObject({ claims: 1, claimedByMe: false, votedByMe: false })
  })

  it('still lets a claimer release a claim after the request ships', async () => {
    const user = await makeUser()
    const row = await seedRequest(user, { status: 'approved' })
    const post = { method: 'POST', headers: userHeaders(user) }
    await call(`/api/requests/${row.id}/claim`, post)
    await db.update(pluginRequests).set({ status: 'fulfilled' })
    const res = await call(`/api/requests/${row.id}/claim`, post)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { claimed: boolean }).claimed).toBe(false)
  })
})

describe('fulfillment', () => {
  beforeEach(clearDb)

  it('fulfills the request when an admin approves the plugin with the same slug', async () => {
    const user = await makeUser()
    const admin = await makeAdmin()
    const row = await seedRequest(user, { status: 'approved' })
    await makePlugin(user.id, { id: 'firebird', name: 'Firebird', status: 'pending' })

    const res = await call('/api/admin/plugins/firebird', json({ status: 'approved' }, adminHeaders(admin)))
    expect(res.status).toBe(200)

    const view = (await (await call(`/api/requests/${row.id}`)).json()) as View
    expect(view.status).toBe('fulfilled')
    expect(view.fulfilledPlugin).toEqual({ id: 'firebird', name: 'Firebird' })
  })

  it('leaves rejected requests alone', async () => {
    const user = await makeUser()
    const admin = await makeAdmin()
    const row = await seedRequest(user, { status: 'rejected' })
    await makePlugin(user.id, { id: 'firebird', status: 'pending' })
    await call('/api/admin/plugins/firebird', json({ status: 'approved' }, adminHeaders(admin)))
    const stored = await db.query.pluginRequests.findFirst({ where: { id: row.id } })
    expect(stored?.status).toBe('rejected')
  })
})

describe('fulfillment on first manifest', () => {
  beforeEach(clearDb)

  it('ships the request when an approved plugin gets its first manifest', async () => {
    const { applyManifestToPlugin } = await import('../../src/lib/manifest-apply')
    const user = await makeUser()
    const row = await seedRequest(user, { status: 'approved' })
    await makePlugin(user.id, { id: 'firebird', status: 'approved', manifestVersion: null })

    await applyManifestToPlugin('firebird', { manifestVersion: null, updatedAt: Date.now() } as never)
    expect((await db.query.pluginRequests.findFirst({ where: { id: row.id } }))?.status).toBe('approved')

    await applyManifestToPlugin('firebird', { manifestVersion: '0.1.0', updatedAt: Date.now() } as never)
    expect((await db.query.pluginRequests.findFirst({ where: { id: row.id } }))?.status).toBe('fulfilled')
  })
})
