import { describe, it, expect } from 'bun:test'
import { buildSchema } from '../src/index'
import { ManifestSchema } from '../src/core'

describe('buildSchema', () => {
  it('returns a JSON Schema 2020-12 object with the locked core fields', () => {
    const schema = buildSchema({ coreSchema: ManifestSchema as never })
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    const props = schema.properties as Record<string, unknown>
    expect(props.name).toBeTruthy()
    expect(props.kind).toBeTruthy()
  })

  it('merges global extensions on top of the core properties', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      extensions: { 'x-app': { type: 'string', description: 'app-specific' } },
    })
    const props = schema.properties as Record<string, unknown>
    expect(props['x-app']).toEqual({ type: 'string', description: 'app-specific' })
  })

  it('produces a kind-scoped schema when a kind is requested', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      extensions: { 'x-global': { type: 'string' } },
      kindOverrides: {
        theme: { 'x-theme': { type: 'string' } },
      },
      kind: 'theme',
    })
    const props = schema.properties as Record<string, unknown>
    expect(props['x-theme']).toBeTruthy()
    expect(props['x-global']).toBeUndefined()
    expect(schema.$id).toContain('?kind=theme')
  })

  it('emits allOf/if/then for every kind override when no specific kind is requested', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      kindOverrides: {
        theme: { 'x-theme': { type: 'string' } },
        snippet: { 'x-snippet': { type: 'string' } },
      },
    }) as { allOf?: Array<{ if?: { properties?: { kind?: { const?: string } } } }> }
    expect(schema.allOf?.length).toBe(2)
    const constants = schema.allOf!.map((c) => c.if?.properties?.kind?.const)
    expect(new Set(constants)).toEqual(new Set(['theme', 'snippet']))
  })

  it('uses the schemaUrl when provided as the $id base', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      schemaUrl: 'https://example.com/manifest.schema.json',
    })
    expect(schema.$id).toBe('https://example.com/manifest.schema.json')
  })
})
