import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { setExtensionsDelta } from '../../src/lib/manifest-schema'
import { setSetting } from '../../src/lib/settings'

describe('GET /manifest.schema.json', () => {
  beforeEach(clearDb)

  it('returns a JSON Schema 2020-12 document with the locked core', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/manifest.schema.json'))
    expect(res.status).toBe(200)
    const ct = res.headers.get('content-type') ?? ''
    expect(ct).toContain('application/schema+json')
    const schema = await res.json() as Record<string, unknown>
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect((schema.properties as Record<string, unknown>).name).toBeTruthy()
    expect((schema.properties as Record<string, unknown>).kind).toBeTruthy()
  })

  it('reflects the configured schema URL in $id', async () => {
    await setSetting('manifest.schema_url', 'https://tabularis.example/manifest.schema.json')
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/manifest.schema.json'))
    const schema = await res.json() as Record<string, unknown>
    expect(schema.$id).toBe('https://tabularis.example/manifest.schema.json')
  })

  it('merges admin extensions into the served properties', async () => {
    await setExtensionsDelta({
      'x-tabularis': {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['light', 'dark'] } },
      },
    })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/manifest.schema.json'))
    const schema = await res.json() as Record<string, unknown>
    const props = schema.properties as Record<string, unknown>
    expect(props['x-tabularis']).toBeTruthy()
    expect(props.name).toBeTruthy()
  })
})
