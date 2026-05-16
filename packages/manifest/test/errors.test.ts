import { describe, it, expect } from 'bun:test'
import Ajv from 'ajv'
import { mapAjvErrors, type ValidationError } from '../src/errors'

describe('mapAjvErrors', () => {
  it('returns an empty array when there are no errors', () => {
    expect(mapAjvErrors(null)).toEqual([])
    expect(mapAjvErrors(undefined)).toEqual([])
    expect(mapAjvErrors([])).toEqual([])
  })

  it('maps ajv ErrorObjects to the ValidationError shape', () => {
    const ajv = new Ajv({ allErrors: true, verbose: true })
    const validate = ajv.compile({
      type: 'object',
      properties: { name: { type: 'string', minLength: 1 } },
      required: ['name'],
      additionalProperties: false,
    })
    validate({ name: 42, extra: 'no' })
    const mapped: ValidationError[] = mapAjvErrors(validate.errors)

    const byPath = Object.fromEntries(mapped.map((e) => [e.path, e]))
    expect(byPath['/name']?.code).toBe('type')
    expect(byPath['/name']?.expected).toBe('string')
    expect(byPath['/name']?.actual).toBe(42)
    expect(mapped.some((e) => e.code === 'additionalProperties' && e.path === '/extra')).toBe(true)
  })

  it('truncates very long actual values', () => {
    const ajv = new Ajv({ allErrors: true, verbose: true })
    const validate = ajv.compile({ type: 'object', properties: { x: { type: 'number' } } })
    const long = 'a'.repeat(500)
    validate({ x: long })
    const mapped = mapAjvErrors(validate.errors)
    const e = mapped.find((m) => m.path === '/x')!
    expect(typeof e.actual).toBe('string')
    expect((e.actual as string).length).toBeLessThanOrEqual(200)
  })

  it('puts the missing field in the path for required-property errors', () => {
    const ajv = new Ajv({ allErrors: true, verbose: true })
    const validate = ajv.compile({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    })
    validate({})
    const mapped = mapAjvErrors(validate.errors)
    const e = mapped.find((m) => m.code === 'required')!
    expect(e.path).toBe('/name')
    expect(e.expected).toBeUndefined()
  })

  it('appends the offending property to nested additionalProperties paths', () => {
    const ajv = new Ajv({ allErrors: true, verbose: true })
    const validate = ajv.compile({
      type: 'object',
      properties: {
        meta: { type: 'object', properties: {}, additionalProperties: false },
      },
    })
    validate({ meta: { bogus: 1 } })
    const mapped = mapAjvErrors(validate.errors)
    const e = mapped.find((m) => m.code === 'additionalProperties')!
    expect(e.path).toBe('/meta/bogus')
  })
})
