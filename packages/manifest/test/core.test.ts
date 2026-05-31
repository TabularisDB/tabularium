import { describe, it, expect } from 'bun:test'
import { ManifestSchema, type Manifest } from '../src/index'

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
  })

  it('exposes a Manifest static type', () => {
    const sample: Manifest = { name: 'X', version: '0.1.0' }
    expect(sample.name).toBe('X')
  })

  it('declares version as a required field', () => {
    const required = (ManifestSchema as { required?: string[] }).required ?? []
    expect(required).toContain('version')
  })
})
