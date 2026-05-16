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
    type AllOfClause = {
      if?: { properties?: { kind?: { const?: string } } }
      then?: { properties?: Record<string, unknown>; additionalProperties?: boolean }
    }
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      kindOverrides: {
        theme: { 'x-theme': { type: 'string' } },
        snippet: { 'x-snippet': { type: 'string' } },
      },
    }) as { allOf?: AllOfClause[] }
    expect(schema.allOf?.length).toBe(2)
    const constants = schema.allOf!.map((c) => c.if?.properties?.kind?.const)
    expect(new Set(constants)).toEqual(new Set(['theme', 'snippet']))

    const themeClause = schema.allOf!.find((c) => c.if?.properties?.kind?.const === 'theme')!
    expect(themeClause.then?.additionalProperties).toBe(false)
    expect(themeClause.then?.properties?.['x-theme']).toBeTruthy()
    expect(themeClause.then?.properties?.name).toBeTruthy()
  })

  it('skips kinds with empty extension deltas (matches original buildMergedSchema)', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      kindOverrides: {
        theme: { 'x-theme': { type: 'string' } },
        empty: {},
      },
    }) as { allOf?: Array<{ if?: { properties?: { kind?: { const?: string } } } }> }
    expect(schema.allOf?.length).toBe(1)
    expect(schema.allOf![0].if?.properties?.kind?.const).toBe('theme')
  })

  it('falls back to global extensions when the requested kind has no override', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      extensions: { 'x-global': { type: 'string' } },
      kind: 'nonexistent',
    })
    const props = schema.properties as Record<string, unknown>
    expect(props['x-global']).toEqual({ type: 'string' })
    expect(schema.$id).toContain('?kind=nonexistent')
  })

  it('uses the schemaUrl when provided as the $id base', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      schemaUrl: 'https://example.com/manifest.schema.json',
    })
    expect(schema.$id).toBe('https://example.com/manifest.schema.json')
  })
})
