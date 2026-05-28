import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'

async function adminToken() {
  const u = await makeUser({ role: 'admin' })
  return signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
}

describe('/api/admin/docs', () => {
  beforeEach(clearDb)

  it('GET returns empty config initially', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/docs', { headers: { Authorization: `Bearer ${token}` } }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { config: { introMarkdown: string | null; customSections: unknown[] } }
    expect(data.config.introMarkdown).toBeNull()
    expect(data.config.customSections).toEqual([])
  })

  it('PUT sets intro + outro', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/docs', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          intro: { body: '# Hi', translations: { de: '# Hallo' } },
          outro: { body: 'Footer', translations: {} },
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { config: { introMarkdown: string; outroMarkdown: string } }
    expect(data.config.introMarkdown).toBe('# Hi')
    expect(data.config.outroMarkdown).toBe('Footer')
  })

  it('401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/docs'))
    expect(res.status).toBe(401)
  })
})

describe('/api/admin/docs/sections', () => {
  beforeEach(clearDb)

  it('POST creates a section, GET lists it, PUT updates it, DELETE removes it', async () => {
    const token = await adminToken()
    const app = await buildApp()

    const createRes = await app.handle(
      new Request('http://localhost/api/admin/docs/sections', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'welcome',
          title: 'Welcome',
          body: '# Hi',
          position: 'page_top',
        }),
      }),
    )
    expect(createRes.status).toBe(201)

    const listRes = await app.handle(
      new Request('http://localhost/api/admin/docs/sections', { headers: { Authorization: `Bearer ${token}` } }),
    )
    const listData = (await listRes.json()) as { sections: Array<{ id: string }> }
    expect(listData.sections).toHaveLength(1)

    const updateRes = await app.handle(
      new Request('http://localhost/api/admin/docs/sections/welcome', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'welcome',
          title: 'Welcome updated',
          body: '# Hi updated',
          position: 'page_top',
        }),
      }),
    )
    expect(updateRes.status).toBe(200)

    const deleteRes = await app.handle(
      new Request('http://localhost/api/admin/docs/sections/welcome', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(deleteRes.status).toBe(204)
  })

  it('POST rejects duplicate id with 409', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const body = JSON.stringify({ id: 'dup', title: null, body: 'x', position: 'page_top' })
    const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    await app.handle(new Request('http://localhost/api/admin/docs/sections', { method: 'POST', headers, body }))
    const res = await app.handle(new Request('http://localhost/api/admin/docs/sections', { method: 'POST', headers, body }))
    expect(res.status).toBe(409)
  })

  it('PUT 404 when section does not exist', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/docs/sections/nope', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'nope', title: null, body: 'x', position: 'page_top' }),
      }),
    )
    expect(res.status).toBe(404)
  })
})
