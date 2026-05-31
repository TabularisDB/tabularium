import { describe, it, expect } from 'bun:test'
import { parseManifest, ParseError } from '../src/index'

describe('parseManifest', () => {
  it('parses a JSON manifest', () => {
    const parsed = parseManifest('{"name":"X","kind":"snippet"}')
    expect(parsed.name).toBe('X')
    expect(parsed.kind).toBe('snippet')
  })

  it('strips authored $schema (IDE hint, not data)', () => {
    const parsed = parseManifest('{"$schema":"https://example/schema.json","name":"X"}')
    expect((parsed as Record<string, unknown>).$schema).toBeUndefined()
    expect(parsed.name).toBe('X')
  })

  it('throws ParseError on invalid JSON', () => {
    expect(() => parseManifest('{ not json')).toThrow(ParseError)
  })

  it('throws ParseError when the root is not an object', () => {
    expect(() => parseManifest('["a","b"]')).toThrow(ParseError)
  })
})
