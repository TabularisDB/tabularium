import { describe, it, expect } from 'bun:test'
import { ManifestSchema, validateManifest, type Manifest } from '../src/index'
import { buildSchema } from '../src/schema'

describe('ManifestSchema', () => {
  it('declares the core fields used by Tabularium plugin manifests', () => {
    const props = (ManifestSchema as { properties: Record<string, unknown> }).properties
    expect(props.name).toBeTruthy()
    expect(props.description).toBeTruthy()
    expect(props.kind).toBeTruthy()
    expect(props.screenshots).toBeTruthy()
    expect(props.readme).toBeTruthy()
    expect(props.readmes).toBeTruthy()
    expect(props.documentation_url).toBeTruthy()
    expect(props.support).toBeTruthy()
    expect(props.requires).toBeTruthy()
  })

  it('exposes a Manifest static type', () => {
    const sample: Manifest = { name: 'X', version: '0.1.0' }
    expect(sample.name).toBe('X')
  })

  it('declares version as a required field', () => {
    const required = (ManifestSchema as { required?: string[] }).required ?? []
    expect(required).toContain('version')
  })

  it('accepts a manifest with a populated requires[] entry list', () => {
    const schema = buildSchema({ coreSchema: ManifestSchema as never })
    const result = validateManifest(
      {
        name: 'my-plugin',
        version: '1.0.0',
        requires: [
          { id: 'theme-engine', version: '^2.0.0' },
          { id: 'analytics', optional: true, reason: 'telemetry events' },
        ],
      },
      schema,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const reqs = (result.normalized as Manifest).requires ?? []
      expect(reqs).toHaveLength(2)
      expect(reqs[0]?.id).toBe('theme-engine')
      expect(reqs[1]?.optional).toBe(true)
    }
  })

  it('rejects requires[] entries that violate the id pattern', () => {
    const schema = buildSchema({ coreSchema: ManifestSchema as never })
    const result = validateManifest(
      { name: 'my-plugin', version: '1.0.0', requires: [{ id: 'BAD ID' }] },
      schema,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === '/requires/0/id' && e.code === 'pattern')).toBe(true)
    }
  })
})
