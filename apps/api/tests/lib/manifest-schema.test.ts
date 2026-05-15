import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import {
  validateExtensionsDelta,
  getExtensionsDelta,
  setExtensionsDelta,
  buildMergedSchema,
} from '../../src/lib/manifest-schema'

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
