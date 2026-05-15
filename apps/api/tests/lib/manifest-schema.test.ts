import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import {
  validateExtensionsDelta,
  getExtensionsDelta,
  setExtensionsDelta,
  getEffectiveExtensions,
  buildMergedSchema,
} from '../../src/lib/manifest-schema'
import { createKind, updateKind } from '../../src/lib/kinds'

describe('validateExtensionsDelta', () => {
  it('accepts an empty delta', () => {
    expect(validateExtensionsDelta({})).toEqual({})
    expect(validateExtensionsDelta(null)).toEqual({})
    expect(validateExtensionsDelta(undefined)).toEqual({})
  })

  it('accepts a single string property', () => {
    const out = validateExtensionsDelta({
      'x-tabularis': { type: 'string', description: 'app key' },
    })
    expect(out['x-tabularis']).toEqual({ type: 'string', description: 'app key' })
  })

  it('accepts nested objects with required fields', () => {
    const out = validateExtensionsDelta({
      tabularis: {
        type: 'object',
        properties: {
          widgets: { type: 'array', items: { type: 'string' } },
          mode: { type: 'string', enum: ['light', 'dark'] },
        },
        required: ['widgets'],
      },
    })
    expect((out.tabularis.properties as Record<string, unknown>).widgets).toBeTruthy()
  })

  it('rejects shadowing of core fields', () => {
    expect(() =>
      validateExtensionsDelta({ name: { type: 'string' } }),
    ).toThrow(/shadows a core/)
    expect(() =>
      validateExtensionsDelta({ kind: { type: 'string' } }),
    ).toThrow(/shadows a core/)
  })

  it('rejects unknown types', () => {
    expect(() => validateExtensionsDelta({ x: { type: 'null' } })).toThrow(/type must be one of/)
  })

  it('rejects $ref', () => {
    expect(() =>
      validateExtensionsDelta({ x: { type: 'object', $ref: 'http://evil/schema' } }),
    ).toThrow(/\$ref is not allowed/)
  })

  it('rejects invalid property names', () => {
    expect(() => validateExtensionsDelta({ '1bad': { type: 'string' } })).toThrow(/invalid property name/)
    expect(() => validateExtensionsDelta({ 'bad name': { type: 'string' } })).toThrow(/invalid property name/)
  })

  it('rejects arrays without items', () => {
    expect(() => validateExtensionsDelta({ x: { type: 'array' } })).toThrow(/items: required/)
  })

  it('rejects excessive nesting', () => {
    const deep = (level: number): Record<string, unknown> =>
      level === 0
        ? { type: 'string' }
        : { type: 'object', properties: { x: deep(level - 1) } }
    expect(() => validateExtensionsDelta({ x: deep(7) })).toThrow(/nesting exceeds max depth/)
  })

  it('rejects more than the max top-level properties', () => {
    const big: Record<string, unknown> = {}
    for (let i = 0; i < 33; i++) big[`p${i}`] = { type: 'string' }
    expect(() => validateExtensionsDelta(big)).toThrow(/more than/)
  })
})

describe('getExtensionsDelta / setExtensionsDelta', () => {
  beforeEach(clearDb)

  it('returns empty when nothing stored', () => {
    expect(getExtensionsDelta()).toEqual({})
  })

  it('persists and reads back', async () => {
    await setExtensionsDelta({
      'x-app': { type: 'string', description: 'opaque' },
    })
    expect(getExtensionsDelta()).toEqual({
      'x-app': { type: 'string', description: 'opaque' },
    })
  })

  it('clears the setting when given null', async () => {
    await setExtensionsDelta({ 'x-app': { type: 'string' } })
    await setExtensionsDelta(null)
    expect(getExtensionsDelta()).toEqual({})
  })

  it('clears the setting when given an empty object', async () => {
    await setExtensionsDelta({ 'x-app': { type: 'string' } })
    await setExtensionsDelta({})
    expect(getExtensionsDelta()).toEqual({})
  })

  it('throws on invalid input at set-time', async () => {
    await expect(setExtensionsDelta({ kind: { type: 'string' } })).rejects.toThrow()
  })
})

describe('buildMergedSchema', () => {
  beforeEach(clearDb)

  it('produces a JSON Schema 2020-12 object with $id and locked core fields', () => {
    const schema = buildMergedSchema()
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(typeof schema.$id).toBe('string')
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    const props = schema.properties as Record<string, unknown>
    expect(props.name).toBeTruthy()
    expect(props.kind).toBeTruthy()
    expect(props.screenshots).toBeTruthy()
  })

  it('merges extensions on top of the core', async () => {
    await setExtensionsDelta({
      'x-app': { type: 'string', description: 'app-specific' },
    })
    const schema = buildMergedSchema()
    const props = schema.properties as Record<string, unknown>
    expect(props['x-app']).toEqual({ type: 'string', description: 'app-specific' })
    expect(props.name).toBeTruthy()
  })
})

describe('per-kind extensions', () => {
  beforeEach(clearDb)

  it('falls back to global when no kind override is set', async () => {
    await setExtensionsDelta({ 'x-global': { type: 'string' } })
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const eff = getEffectiveExtensions('theme')
    expect(eff['x-global']).toBeTruthy()
  })

  it('REPLACES global when a kind override exists', async () => {
    await setExtensionsDelta({ 'x-global': { type: 'string' } })
    await createKind({
      key: 'theme',
      label: 'Themes',
      description: null,
      extensionsSchema: { 'x-theme': { type: 'string' } },
    })
    const eff = getEffectiveExtensions('theme')
    expect(eff['x-theme']).toBeTruthy()
    expect(eff['x-global']).toBeUndefined()
  })

  it('produces a kind-scoped schema when kind option is passed to buildMergedSchema', async () => {
    await setExtensionsDelta({ 'x-global': { type: 'string' } })
    await createKind({
      key: 'theme',
      label: 'Themes',
      description: null,
      extensionsSchema: { 'x-theme': { type: 'string' } },
    })
    const themeSchema = buildMergedSchema({ kind: 'theme' })
    expect(themeSchema.$id).toContain('?kind=theme')
    const props = themeSchema.properties as Record<string, unknown>
    expect(props['x-theme']).toBeTruthy()
    expect(props['x-global']).toBeUndefined()

    const noKindSchema = buildMergedSchema()
    expect(noKindSchema.$id).not.toContain('?kind=')
    const noKindProps = noKindSchema.properties as Record<string, unknown>
    expect(noKindProps['x-global']).toBeTruthy()
    expect(noKindProps['x-theme']).toBeTruthy() // lenient: top-level lists every key
  })

  it('emits allOf/if/then clauses for every kind with extensions', async () => {
    await createKind({
      key: 'theme',
      label: 'Themes',
      description: null,
      extensionsSchema: { 'x-theme': { type: 'string' } },
    })
    await createKind({
      key: 'snippet',
      label: 'Snippets',
      description: null,
      extensionsSchema: { 'x-snippet': { type: 'object', properties: { lang: { type: 'string' } } } },
    })
    const schema = buildMergedSchema() as { allOf?: Array<{ if?: { properties?: { kind?: { const?: string } } } }> }
    expect(schema.allOf).toBeTruthy()
    expect(schema.allOf!.length).toBe(2)
    const constants = schema.allOf!.map((c) => c.if?.properties?.kind?.const)
    expect(new Set(constants)).toEqual(new Set(['theme', 'snippet']))
  })

  it('updates effective extensions when the kind override changes', async () => {
    await createKind({
      key: 'theme',
      label: 'Themes',
      description: null,
      extensionsSchema: { 'x-old': { type: 'string' } },
    })
    expect(getEffectiveExtensions('theme')['x-old']).toBeTruthy()
    await updateKind('theme', {
      key: 'theme',
      label: 'Themes',
      description: null,
      extensionsSchema: { 'x-new': { type: 'string' } },
    })
    const eff = getEffectiveExtensions('theme')
    expect(eff['x-new']).toBeTruthy()
    expect(eff['x-old']).toBeUndefined()
  })
})
