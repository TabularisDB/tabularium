import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { db } from '../../src/db'
import { releases } from '../../src/db/schema'
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
import { createKind } from '../../src/lib/kinds'

describe('GET /api/plugins', () => {
  beforeEach(clearDb)

  it('returns empty list when no plugins', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as { total: number; plugins: unknown[] }
    expect(data.total).toBe(0)
    expect(data.plugins).toHaveLength(0)
  })

  it('returns plugins with search filter', async () => {
    const user = await makeUser()
    await makePlugin(user.id, { id: 'duckdb', name: 'DuckDB' })
    await makePlugin(user.id, { id: 'redis', name: 'Redis' })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?search=duck'))
    const data = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(1)
    expect(data.plugins[0].id).toBe('duckdb')
  })

  it('never exposes webhookSecret in list response', async () => {
    const user = await makeUser()
    await makePlugin(user.id, { id: 'duckdb', webhookSecret: 'should-not-leak' })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = (await res.json()) as { plugins: Array<Record<string, unknown>> }
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
    const data = (await res.json()) as {
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
    const res = await app.handle(new Request('http://localhost/api/plugins/nope/latest?os=linux&arch=x64'))
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
    const res = await app.handle(new Request(`http://localhost/api/plugins/${plugin.id}/latest?os=linux&arch=x64`))
    expect(res.status).toBe(200)
    const data = (await res.json()) as { version: string; download_url: string }
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
    const res = await app.handle(new Request(`http://localhost/api/plugins/${plugin.id}/latest?os=darwin&arch=arm64`))
    expect(res.status).toBe(422)
  })
})

describe('GET /api/plugins/:slug/releases/:version', () => {
  beforeEach(clearDb)

  it('returns 404 for unknown slug', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/plugins/nope/releases/1.0.0?os=linux&arch=x64'),
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 for unknown version', async () => {
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
      new Request(`http://localhost/api/plugins/${plugin.id}/releases/9.9.9?os=linux&arch=x64`),
    )
    expect(res.status).toBe(404)
  })

  it('returns download URL for the pinned version', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id, { latestVersion: '2.0.0' })
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '1.0.0',
      assets: JSON.stringify({ 'linux-x64': 'https://example.com/old.zip' }),
    })
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '2.0.0',
      assets: JSON.stringify({ 'linux-x64': 'https://example.com/new.zip' }),
    })

    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/plugins/${plugin.id}/releases/1.0.0?os=linux&arch=x64`),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { version: string; download_url: string; yanked: boolean }
    expect(data.version).toBe('1.0.0')
    expect(data.download_url).toBe('https://example.com/old.zip')
    expect(data.yanked).toBe(false)
  })

  it('resolves a yanked release with yanked=true', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id, { latestVersion: '1.0.0' })
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '1.0.0',
      assets: JSON.stringify({ 'linux-x64': 'https://example.com/linux.zip' }),
      yankedAt: 1700000000000,
      yankReason: 'critical bug',
    })

    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/plugins/${plugin.id}/releases/1.0.0?os=linux&arch=x64`),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { yanked: boolean; yanked_reason: string | null }
    expect(data.yanked).toBe(true)
    expect(data.yanked_reason).toBe('critical bug')
  })

  it('redirects when redirect=1', async () => {
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
      new Request(`http://localhost/api/plugins/${plugin.id}/releases/1.0.0?os=linux&arch=x64&redirect=1`),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/linux.zip')
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
      new Request(`http://localhost/api/plugins/${plugin.id}/releases/1.0.0?os=darwin&arch=arm64`),
    )
    expect(res.status).toBe(422)
  })
})

describe('GET /api/plugins ?kind filter', () => {
  beforeEach(clearDb)

  it('returns plugins tagged with the kind key', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const user = await makeUser()
    await makePlugin(user.id, { id: 'dark', name: 'Dark', tags: JSON.stringify(['theme', 'dark']) })
    await makePlugin(user.id, { id: 'ducks', name: 'Ducks', tags: JSON.stringify(['birds']) })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?kind=theme'))
    const data = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(1)
    expect(data.plugins[0].id).toBe('dark')
  })

  it('returns empty for an unknown kind key', async () => {
    const user = await makeUser()
    await makePlugin(user.id, { id: 'dark', tags: JSON.stringify(['theme']) })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?kind=theme'))
    const data = (await res.json()) as { total: number }
    expect(data.total).toBe(0)
  })
})

describe('GET /api/plugins facets.kinds', () => {
  beforeEach(clearDb)

  it('counts plugins per registered kind, including multi-kind tags', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await createKind({ key: 'snippet', label: 'Snippets', description: null })
    const user = await makeUser()
    await makePlugin(user.id, { id: 'a', tags: JSON.stringify(['theme', 'dark']) })
    await makePlugin(user.id, { id: 'b', tags: JSON.stringify(['snippet']) })
    await makePlugin(user.id, { id: 'c', tags: JSON.stringify(['theme', 'snippet']) })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = (await res.json()) as { facets: { kinds: Array<{ key: string; count: number }> } }
    const byKey = Object.fromEntries(data.facets.kinds.map((k) => [k.key, k.count]))
    expect(byKey.theme).toBe(2)
    expect(byKey.snippet).toBe(2)
  })

  it('omits kinds that are not in the registry', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const user = await makeUser()
    await makePlugin(user.id, { id: 'a', tags: JSON.stringify(['theme', 'unknown-bucket']) })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = (await res.json()) as { facets: { kinds: Array<{ key: string }> } }
    expect(data.facets.kinds.map((k) => k.key)).toEqual(['theme'])
  })
})
