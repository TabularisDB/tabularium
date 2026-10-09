import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
import { db } from '../../src/db'
import { pluginRequests } from '../../src/db/schema'

describe('GET /api/stats', () => {
  beforeEach(clearDb)

  it('returns zeros on an empty registry', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/stats'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plugins: 0, downloads: 0, authors: 0, requests: 0, kinds: 0 })
  })

  it('counts only listed plugins and aggregates downloads, authors and requests', async () => {
    const user = await makeUser()
    await makePlugin(user.id, { id: 'a', status: 'approved', author: 'alice', downloads: 10 })
    await makePlugin(user.id, { id: 'b', status: 'approved', author: 'alice', downloads: 5 })
    await makePlugin(user.id, { id: 'c', status: 'approved', author: 'bob', downloads: 1 })
    await makePlugin(user.id, { id: 'pending', status: 'pending', author: 'carol', downloads: 100 })
    await makePlugin(user.id, { id: 'unindexed', status: 'approved', author: 'dave', manifestVersion: null })
    await db
      .insert(pluginRequests)
      .values({ id: ulid(), slug: 'mongo', name: 'Mongo', description: 'NoSQL', requesterId: user.id })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/stats'))
    expect(await res.json()).toEqual({ plugins: 3, downloads: 16, authors: 2, requests: 1, kinds: 0 })
  })
})
