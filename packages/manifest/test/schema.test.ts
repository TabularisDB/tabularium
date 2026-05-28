import { describe, it, expect } from 'bun:test'
import { buildSchema } from '../src/index'
import { ManifestSchema } from '../src/core'
import type { TSchema } from '@sinclair/typebox'

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

  it('promotes per-property `required: true` extension flags to the schema-level required array', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      extensions: {
        'x-required-field': { type: 'string', required: true },
        'x-optional-field': { type: 'string' },
      },
    })
    const required = schema.required as string[]
    expect(required).toContain('x-required-field')
    expect(required).not.toContain('x-optional-field')
    // The `required: true` flag is stripped from the emitted property schema
    // because JSON Schema doesn't define `required` at the property level.
    const props = schema.properties as Record<string, Record<string, unknown>>
    expect(props['x-required-field'].required).toBeUndefined()
  })

  it('promotes required flags inside a kind-scoped schema', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      kind: 'theme',
      kindOverrides: {
        theme: { 'x-theme-api': { type: 'string', required: true } },
      },
    })
    const required = schema.required as string[]
    expect(required).toContain('x-theme-api')
  })

  it('promotes kind-override required flags in the merged unscoped schema', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      kindOverrides: {
        theme: { 'x-theme-api': { type: 'string', required: true } },
      },
    })
    // When unscoped, the kind override lives inside an allOf/if-then branch.
    // The branch's required must include the flagged field so non-theme
    // manifests aren't penalised but theme manifests are.
    const allOf = schema.allOf as Array<{ then: { required?: string[] } }>
    expect(allOf?.[0]?.then?.required).toContain('x-theme-api')
    // Top-level required is just coreRequired (which can be undefined when
    // empty) — no leakage of kind-scoped required.
    const required = (schema.required ?? []) as string[]
    expect(required).not.toContain('x-theme-api')
  })
})

describe('buildSchema — x-translations stripping', () => {
  it('strips x-translations from emitted global extension props', () => {
    const result = buildSchema({
      coreSchema: ManifestSchema as unknown as TSchema,
      extensions: {
        myProp: {
          type: 'string',
          description: 'Default',
          'x-translations': { de: 'Auf Deutsch' },
        },
      },
    })
    const props = (result.properties as Record<string, Record<string, unknown>>).myProp
    expect(props['x-translations']).toBeUndefined()
    expect(props.description).toBe('Default')
  })

  it('strips x-translations from nested property in object', () => {
    const result = buildSchema({
      coreSchema: ManifestSchema as unknown as TSchema,
      extensions: {
        parent: {
          type: 'object',
          properties: {
            child: { type: 'string', 'x-translations': { de: 'X' } },
          },
        },
      },
    })
    const parent = (result.properties as Record<string, Record<string, unknown>>).parent
    const child = (parent.properties as Record<string, Record<string, unknown>>).child
    expect(child['x-translations']).toBeUndefined()
  })

  it('strips x-translations from kind override extensions', () => {
    const result = buildSchema({
      coreSchema: ManifestSchema as unknown as TSchema,
      kindOverrides: {
        theme: {
          themeProp: {
            type: 'string',
            description: 'Theme prop',
            'x-translations': { de: 'Theme-Prop auf Deutsch' },
          },
        },
      },
      kind: 'theme',
    })
    const props = (result.properties as Record<string, Record<string, unknown>>).themeProp
    expect(props['x-translations']).toBeUndefined()
  })
})
