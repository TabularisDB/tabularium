import { describe, it, expect } from 'bun:test'
import { flattenSchemaProps, type FieldDoc } from '../../src/lib/plugin-docs'
import { ManifestSchema } from '@tabularium/manifest'

describe('flattenSchemaProps', () => {
  it('extracts core fields with type + required + description from TypeBox', () => {
    const fields = flattenSchemaProps({
      schema: ManifestSchema as unknown as Record<string, unknown>,
      requiredOverride: null,
      locale: 'en',
    })
    const name = fields.find((f) => f.key === 'name')
    expect(name).toBeDefined()
    expect(name!.type).toBe('string')
    expect(name!.required).toBe(false) // optional in core
  })

  it('marks field required when present in schema.required array', () => {
    const fields = flattenSchemaProps({
      schema: {
        properties: { foo: { type: 'string' }, bar: { type: 'number' } },
        required: ['foo'],
      },
      requiredOverride: null,
      locale: 'en',
    })
    const foo = fields.find((f) => f.key === 'foo')
    expect(foo?.required).toBe(true)
    const bar = fields.find((f) => f.key === 'bar')
    expect(bar?.required).toBe(false)
  })

  it('honours requiredOverride list', () => {
    const fields = flattenSchemaProps({
      schema: { properties: { foo: { type: 'string' } } },
      requiredOverride: ['foo'],
      locale: 'en',
    })
    expect(fields[0].required).toBe(true)
  })

  it('picks x-translations[locale] for description, falls back to description', () => {
    const fields = flattenSchemaProps({
      schema: {
        properties: {
          foo: {
            type: 'string',
            description: 'Default desc',
            'x-translations': { de: 'Deutsche Beschreibung' },
          },
        },
      },
      requiredOverride: null,
      locale: 'de',
    })
    expect(fields[0].description).toBe('Deutsche Beschreibung')
  })

  it('renders array<string> as compound type label', () => {
    const fields = flattenSchemaProps({
      schema: { properties: { tags: { type: 'array', items: { type: 'string' } } } },
      requiredOverride: null,
      locale: 'en',
    })
    expect(fields[0].type).toBe('array<string>')
  })

  it('captures enumValues', () => {
    const fields = flattenSchemaProps({
      schema: { properties: { mode: { type: 'string', enum: ['a', 'b'] } } },
      requiredOverride: null,
      locale: 'en',
    })
    expect(fields[0].type).toBe('enum')
    expect(fields[0].enumValues).toEqual(['a', 'b'])
  })
})
