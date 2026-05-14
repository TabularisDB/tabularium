import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { createKind } from '../../src/lib/kinds'

describe('GET /api/manifest', () => {
  beforeEach(clearDb)

  it('includes empty kinds when none defined', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/manifest'))
    expect(res.status).toBe(200)
    const data = await res.json() as { kinds: string[] }
    expect(data.kinds).toEqual([])
  })

  it('reflects active kind keys', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await createKind({ key: 'snippet', label: 'Snippets', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/manifest'))
    const data = await res.json() as { kinds: string[] }
    expect(data.kinds.sort()).toEqual(['snippet', 'theme'])
  })
})
