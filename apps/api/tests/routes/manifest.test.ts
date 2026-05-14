import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { createKind } from '../../src/lib/kinds'
import { setSetting } from '../../src/lib/settings'

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

  it('returns the default tabularium paths and schema $id when nothing is configured', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/manifest'))
    const data = await res.json() as {
      paths: string[]
      description: string
      schema: { $id?: string }
    }
    expect(data.paths).toEqual([
      '.tabularium',
      '.tabularium.yaml',
      '.tabularium.yml',
      '.tabularium.json',
    ])
    expect(data.description).toContain('.tabularium')
    expect(data.schema.$id).toBe('http://localhost:3000/api/manifest')
  })

  it('reflects a custom filename setting in paths and description', async () => {
    await setSetting('manifest.filename', 'tabularis')
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/manifest'))
    const data = await res.json() as { paths: string[]; description: string }
    expect(data.paths).toEqual([
      '.tabularis',
      '.tabularis.yaml',
      '.tabularis.yml',
      '.tabularis.json',
    ])
    expect(data.description).toContain('.tabularis')
    expect(data.description).not.toContain('.tabularium')
  })

  it('reflects a custom schema URL setting', async () => {
    await setSetting('manifest.schema_url', 'https://custom.example/spec.json')
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/manifest'))
    const data = await res.json() as { schema: { $id?: string } }
    expect(data.schema.$id).toBe('https://custom.example/spec.json')
  })
})
