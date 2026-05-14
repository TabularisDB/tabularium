import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { db } from '../../src/db'
import { releases } from '../../src/db/schema'
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'

describe('GET /api/plugins', () => {
  beforeEach(clearDb)

  it('returns empty list when no plugins', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    expect(res.status).toBe(200)
    const data = await res.json() as { total: number; plugins: unknown[] }
    expect(data.total).toBe(0)
    expect(data.plugins).toHaveLength(0)
  })

  it('returns plugins with search filter', async () => {
    const user = await makeUser()
    await makePlugin(user.id, { id: 'duckdb', name: 'DuckDB' })
    await makePlugin(user.id, { id: 'redis', name: 'Redis' })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?search=duck'))
    const data = await res.json() as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(1)
    expect(data.plugins[0].id).toBe('duckdb')
  })

  it('never exposes webhookSecret in list response', async () => {
    const user = await makeUser()
    await makePlugin(user.id, { id: 'duckdb', webhookSecret: 'should-not-leak' })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = await res.json() as { plugins: Array<Record<string, unknown>> }
    expect(data.plugins[0]).not.toHaveProperty('webhookSecret')
    expect(JSON.stringify(data)).not.toContain('should-not-leak')
  })
})

describe('GET /api/plugins/:slug', () => {
  beforeEach(clearDb)

  it('returns 404 for unknown slug', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/nope'))
    expect(res.status).toBe(404)
  })

  it('returns plugin with parsed assets in releases', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '1.0.0',
      assets: JSON.stringify({ 'linux-x64': 'https://example.com/linux.zip' }),
    })

    const app = await buildApp()
    const res = await app.handle(new Request(`http://localhost/api/plugins/${plugin.id}`))
    expect(res.status).toBe(200)
    const data = await res.json() as {
      id: string
      releases: Array<{ version: string; assets: Record<string, { url: string }> }>
    }
    expect(data.id).toBe(plugin.id)
    expect(data.releases[0].assets['linux-x64'].url).toBe('https://example.com/linux.zip')
  })
})

describe('GET /api/plugins/:slug/latest', () => {
  beforeEach(clearDb)

  it('returns 404 for unknown slug', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/plugins/nope/latest?os=linux&arch=x64'),
    )
    expect(res.status).toBe(404)
  })

  it('returns download URL for matching platform', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id, { latestVersion: '1.0.0' })
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '1.0.0',
      assets: JSON.stringify({ 'linux-x64': 'https://example.com/linux.zip' }),
    })

    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/plugins/${plugin.id}/latest?os=linux&arch=x64`),
    )
    expect(res.status).toBe(200)
    const data = await res.json() as { version: string; download_url: string }
    expect(data.version).toBe('1.0.0')
    expect(data.download_url).toBe('https://example.com/linux.zip')
  })

  it('returns 422 when platform not supported', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id, { latestVersion: '1.0.0' })
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '1.0.0',
      assets: JSON.stringify({ 'linux-x64': 'https://example.com/linux.zip' }),
    })

    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/plugins/${plugin.id}/latest?os=darwin&arch=arm64`),
    )
    expect(res.status).toBe(422)
  })
})
