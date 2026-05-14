import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { createKind } from '../../src/lib/kinds'

describe('GET /api/kinds (public)', () => {
  beforeEach(clearDb)

  it('returns empty list on fresh install', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/kinds'))
    expect(res.status).toBe(200)
    const data = await res.json() as { kinds: unknown[] }
    expect(data.kinds).toEqual([])
  })

  it('returns admin-defined kinds', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/kinds'))
    const data = await res.json() as { kinds: Array<{ key: string; label: string }> }
    expect(data.kinds).toHaveLength(1)
    expect(data.kinds[0].key).toBe('theme')
  })
})
