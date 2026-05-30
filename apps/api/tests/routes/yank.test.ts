import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'
import { createPublisherToken } from '../../src/lib/publisher-tokens'
import { db } from '../../src/db'
import { releases, auditLog } from '../../src/db/schema'
import { and, eq } from 'drizzle-orm'

async function makeRelease(pluginId: string, version: string, assets: Record<string, { url: string }> = {}) {
  const id = ulid()
  await db.insert(releases).values({
    id,
    pluginId,
    version,
    assets: JSON.stringify(assets),
  })
  return id
}

async function yankRequest(slug: string, token: string, body: Record<string, unknown>) {
  const app = await buildApp()
  return app.handle(
    new Request(`http://localhost/api/publish/${slug}/yank`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/publish/:slug/yank', () => {
  beforeEach(clearDb)

  it('401 without token', async () => {
    const res = await (await buildApp()).handle(
      new Request('http://localhost/api/publish/alpha/yank', { method: 'POST' }),
    )
    expect(res.status).toBe(401)
  })

  it('yanks a release with yank:<slug> scope', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha' })
    await makeRelease('alpha', '1.0.0', { 'linux-x64': { url: 'https://example.com/a.zip' } })
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['yank:alpha'] })

    const res = await yankRequest('alpha', token, { version: '1.0.0', reason: 'broken on macOS' })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { yanked: boolean }
    expect(data.yanked).toBe(true)

    const row = await db.query.releases.findFirst({ where: { pluginId: 'alpha', version: '1.0.0' } })
    expect(row?.yankedAt).not.toBeNull()
    expect(row?.yankedBy).toBe(u.id)
    expect(row?.yankReason).toBe('broken on macOS')
  })

  it('yank:* matches any slug', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha' })
    await makeRelease('alpha', '1.0.0')
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['yank:*'] })

    const res = await yankRequest('alpha', token, { version: '1.0.0' })
    expect(res.status).toBe(200)
  })

  it('publish:<slug> alone does NOT permit yank', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha' })
    await makeRelease('alpha', '1.0.0')
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:alpha'] })

    const res = await yankRequest('alpha', token, { version: '1.0.0' })
    expect(res.status).toBe(403)
  })

  it('non-owner yank returns 403', async () => {
    const owner = await makeUser({ username: 'owner' })
    const other = await makeUser({ username: 'other' })
    await makePlugin(owner.id, { id: 'alpha' })
    await makeRelease('alpha', '1.0.0')
    const { token } = await createPublisherToken({ userId: other.id, name: 'CI', scopes: ['yank:*'] })

    const res = await yankRequest('alpha', token, { version: '1.0.0' })
    expect(res.status).toBe(403)
  })

  it('idempotent: yanking an already-yanked release returns alreadyYanked:true', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha' })
    await makeRelease('alpha', '1.0.0')
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['yank:alpha'] })

    await yankRequest('alpha', token, { version: '1.0.0' })
    const second = await yankRequest('alpha', token, { version: '1.0.0' })
    const data = (await second.json()) as { yanked: boolean; alreadyYanked?: boolean }
    expect(data.yanked).toBe(true)
    expect(data.alreadyYanked).toBe(true)
  })

  it('unyank clears the columns', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha' })
    await makeRelease('alpha', '1.0.0')
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['yank:alpha'] })

    await yankRequest('alpha', token, { version: '1.0.0', reason: 'oops' })
    const unyank = await yankRequest('alpha', token, { version: '1.0.0', unyank: true })
    expect(unyank.status).toBe(200)
    const row = await db.query.releases.findFirst({ where: { pluginId: 'alpha', version: '1.0.0' } })
    expect(row?.yankedAt).toBeNull()
    expect(row?.yankedBy).toBeNull()
    expect(row?.yankReason).toBeNull()
  })

  it('writes plugin.yank and plugin.unyank audit entries', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha' })
    await makeRelease('alpha', '1.0.0')
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['yank:alpha'] })

    await yankRequest('alpha', token, { version: '1.0.0', reason: 'broken' })
    await yankRequest('alpha', token, { version: '1.0.0', unyank: true })

    const yanks = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.yank'))
    const unyanks = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.unyank'))
    expect(yanks).toHaveLength(1)
    expect(unyanks).toHaveLength(1)
  })
})

describe('GET /api/plugins/:slug/latest skips yanked', () => {
  beforeEach(clearDb)

  it('falls back to the previous non-yanked release when latestVersion is yanked', async () => {
    const u = await makeUser()
    await makePlugin(u.id, {
      id: 'alpha',
      latestVersion: '1.1.0',
    })
    // Older release with usable assets
    await makeRelease('alpha', '1.0.0', { 'linux-x64': { url: 'https://example.com/v1.zip' } })
    // Newer (yanked) release
    const newerId = ulid()
    await db.insert(releases).values({
      id: newerId,
      pluginId: 'alpha',
      version: '1.1.0',
      assets: JSON.stringify({ 'linux-x64': { url: 'https://example.com/v11.zip' } }),
      yankedAt: Date.now(),
      yankedBy: u.id,
      yankReason: 'broken',
    })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/alpha/latest?os=linux&arch=x64'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as { version: string; download_url: string }
    expect(data.version).toBe('1.0.0')
    expect(data.download_url).toBe('https://example.com/v1.zip')
    void newerId
    void and
  })

  it('404 when every release is yanked', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha', latestVersion: '1.0.0' })
    const id = ulid()
    await db.insert(releases).values({
      id,
      pluginId: 'alpha',
      version: '1.0.0',
      assets: JSON.stringify({ 'linux-x64': { url: 'https://example.com/v1.zip' } }),
      yankedAt: Date.now(),
      yankedBy: u.id,
    })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/alpha/latest?os=linux&arch=x64'))
    expect(res.status).toBe(404)
  })
})
