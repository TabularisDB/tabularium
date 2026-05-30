import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'
import { manifestPatch } from '../../src/lib/manifest-apply'
import type { ResolvedManifest } from '../../src/lib/manifest'

function buildManifest(extras: Record<string, unknown>): ResolvedManifest {
  return {
    raw: '',
    parsed: {
      name: 'p',
      description: 'd',
      ...extras,
    } as ResolvedManifest['parsed'],
    readmeMarkdown: null,
    readmeLocales: null,
    source: 'tabularium.json',
  }
}

describe('manifestPatch — extensions capture', () => {
  it('captures non-core fields into the extensions blob', () => {
    const patch = manifestPatch(
      buildManifest({
        engine: 'firestore',
        paradigms: ['document'],
        capabilities: { schemas: false },
      }),
      { repoBase: '', version: null },
    )
    const ext = JSON.parse(patch.extensions ?? 'null')
    expect(ext).toEqual({
      engine: 'firestore',
      paradigms: ['document'],
      capabilities: { schemas: false },
    })
  })

  it('leaves extensions null when no non-core fields present', () => {
    const patch = manifestPatch(buildManifest({}), { repoBase: '', version: null })
    expect(patch.extensions).toBeNull()
  })

  it('does NOT leak core fields into extensions', () => {
    const patch = manifestPatch(
      buildManifest({
        category: 'database',
        tags: ['nosql'],
        engine: 'firestore',
      }),
      { repoBase: '', version: null },
    )
    const ext = JSON.parse(patch.extensions ?? 'null')
    expect(ext).toEqual({ engine: 'firestore' })
  })
})

describe('GET /api/plugins extensions surface + filter', () => {
  beforeEach(clearDb)

  it('returns extensions on list items', async () => {
    const u = await makeUser()
    await makePlugin(u.id, {
      id: 'firestore',
      extensions: JSON.stringify({ engine: 'firestore', paradigms: ['document'] }),
    })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = (await res.json()) as { plugins: Array<{ id: string; extensions: Record<string, unknown> | null }> }
    expect(data.plugins[0].id).toBe('firestore')
    expect(data.plugins[0].extensions).toEqual({ engine: 'firestore', paradigms: ['document'] })
  })

  it('returns extensions on the detail endpoint', async () => {
    const u = await makeUser()
    await makePlugin(u.id, {
      id: 'firestore',
      extensions: JSON.stringify({ engine: 'firestore' }),
    })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/firestore'))
    const d = (await res.json()) as { extensions: Record<string, unknown> | null }
    expect(d.extensions).toEqual({ engine: 'firestore' })
  })

  it('filters by ?ext.<scalar>=<value>', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'firestore', extensions: JSON.stringify({ engine: 'firestore' }) })
    await makePlugin(u.id, { id: 'postgres', extensions: JSON.stringify({ engine: 'postgres' }) })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?ext.engine=firestore'))
    const data = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(1)
    expect(data.plugins[0].id).toBe('firestore')
  })

  it('filters by ?ext.<key>=<value> against array members', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'firestore', extensions: JSON.stringify({ paradigms: ['document'] }) })
    await makePlugin(u.id, {
      id: 'surreal',
      extensions: JSON.stringify({ paradigms: ['document', 'graph', 'relational'] }),
    })
    await makePlugin(u.id, { id: 'postgres', extensions: JSON.stringify({ paradigms: ['relational'] }) })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?ext.paradigms=document'))
    const data = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(2)
    const ids = data.plugins.map((p) => p.id).sort()
    expect(ids).toEqual(['firestore', 'surreal'])
  })

  it('combines two ext filters with AND', async () => {
    const u = await makeUser()
    await makePlugin(u.id, {
      id: 'firestore',
      extensions: JSON.stringify({ engine: 'firestore', paradigms: ['document'] }),
    })
    await makePlugin(u.id, { id: 'mongo', extensions: JSON.stringify({ engine: 'mongo', paradigms: ['document'] }) })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/plugins?ext.engine=firestore&ext.paradigms=document'),
    )
    const data = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(1)
    expect(data.plugins[0].id).toBe('firestore')
  })
})
