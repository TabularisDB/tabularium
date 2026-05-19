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

  it('silently skips core-shadowing keys (useful when pasting a full root schema)', () => {
    const out = validateExtensionsDelta({
      name: { type: 'string' },
      kind: { type: 'string' },
      'x-app': { type: 'string' },
    })
    expect(out.name).toBeUndefined()
    expect(out.kind).toBeUndefined()
    expect(out['x-app']).toBeTruthy()
  })

  it('unwraps a pasted root JSON Schema document', () => {
    const out = validateExtensionsDelta({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'https://example.com/schema.json',
      title: 'My Schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        'x-app-id': { type: 'string', pattern: '^[a-z]+$' },
        'x-port': { type: ['integer', 'null'] },
      },
      required: ['x-app-id'],
    })
    expect(out['x-app-id']).toBeTruthy()
    expect(out['x-port']).toBeTruthy()
  })

  it('tolerates unknown / unsupported types (maps to Type.Any at translation time)', () => {
    const out = validateExtensionsDelta({ x: { type: 'null' } })
    expect(out.x).toBeTruthy()
  })

  it('rejects $ref', () => {
    expect(() => validateExtensionsDelta({ x: { type: 'object', $ref: 'http://evil/schema' } })).toThrow(
      /\$ref is not allowed/,
    )
  })

  it('rejects invalid property names at the top level', () => {
    expect(() => validateExtensionsDelta({ '1bad': { type: 'string' } })).toThrow(/invalid property name/)
    expect(() => validateExtensionsDelta({ 'bad name': { type: 'string' } })).toThrow(/invalid property name/)
  })

  it('tolerates arrays without items', () => {
    const out = validateExtensionsDelta({ x: { type: 'array' } })
    expect(out.x).toBeTruthy()
  })

  it('rejects excessive nesting', () => {
    const deep = (level: number): Record<string, unknown> =>
      level === 0 ? { type: 'string' } : { type: 'object', properties: { x: deep(level - 1) } }
    expect(() => validateExtensionsDelta({ x: deep(9) })).toThrow(/nesting exceeds max depth/)
  })

  it('rejects more than the max top-level properties', () => {
    const big: Record<string, unknown> = {}
    for (let i = 0; i < 65; i++) big[`p${i}`] = { type: 'string' }
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

  it('skips core-shadowing entries silently at set-time (so pasting a full schema works)', async () => {
    await setExtensionsDelta({ kind: { type: 'string' }, 'x-real': { type: 'string' } })
    const result = getExtensionsDelta()
    expect(result.kind).toBeUndefined()
    expect(result['x-real']).toBeTruthy()
  })

  it('throws only on hard safety violations ($ref)', async () => {
    await expect(setExtensionsDelta({ 'x-bad': { $ref: 'http://evil/schema' } })).rejects.toThrow(/\$ref/)
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
