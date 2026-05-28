import { describe, it, expect } from 'bun:test'
import { flattenSchemaProps, synthesizeExample, type FieldDoc } from '../../src/lib/plugin-docs'
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

describe('synthesizeExample', () => {
  it('produces values for every property in the schema', () => {
    const obj = synthesizeExample({
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
        kind: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        flag: { type: 'boolean' },
        mode: { type: 'string', enum: ['fast', 'slow'] },
      },
    })
    expect(obj.name).toBe('example')
    expect(obj.tags).toEqual(['example'])
    expect(obj.flag).toBe(true)
    expect(obj.mode).toBe('fast')
  })

  it('uses format-aware placeholders for known formats', () => {
    const obj = synthesizeExample({
      properties: {
        email: { type: 'string', format: 'email' },
        url: { type: 'string', format: 'uri' },
      },
    })
    expect(obj.email).toBe('name@example.com')
    expect(obj.url).toBe('https://example.com')
  })

  it('recurses into nested object properties', () => {
    const obj = synthesizeExample({
      properties: {
        support: {
          type: 'object',
          properties: { email: { type: 'string' }, url: { type: 'string' } },
        },
      },
    })
    expect((obj.support as Record<string, unknown>).email).toBe('example')
  })

  it('honours an explicit example annotation', () => {
    const obj = synthesizeExample({
      properties: {
        license: { type: 'string', example: 'MIT' },
      },
    })
    expect(obj.license).toBe('MIT')
  })

  it('overrides with kindFixedValue (used for the kind: prop)', () => {
    const obj = synthesizeExample({
      properties: { kind: { type: 'string' } },
      fixed: { kind: 'theme' },
    })
    expect(obj.kind).toBe('theme')
  })
})
