import { describe, it, expect } from 'bun:test'
import { parseManifest, ParseError } from '../src/index'

describe('parseManifest', () => {
  it('parses a YAML manifest', () => {
    const parsed = parseManifest('name: My Plugin\nkind: theme\n', 'tabularium.yaml')
    expect(parsed.name).toBe('My Plugin')
    expect(parsed.kind).toBe('theme')
  })

  it('parses a JSON manifest', () => {
    const parsed = parseManifest('{"name":"X","kind":"snippet"}', 'tabularium.json')
    expect(parsed.name).toBe('X')
    expect(parsed.kind).toBe('snippet')
  })

  it('strips authored $schema (IDE hint, not data)', () => {
    const parsed = parseManifest('$schema: https://example/schema.json\nname: X\n', 'tabularium.yaml')
    expect((parsed as Record<string, unknown>).$schema).toBeUndefined()
    expect(parsed.name).toBe('X')
  })

  it('throws ParseError on invalid JSON', () => {
    expect(() => parseManifest('{ not json', 'tabularium.json')).toThrow(ParseError)
  })

  it('throws ParseError when the root is not an object', () => {
    expect(() => parseManifest('- a\n- b\n', 'tabularium.yaml')).toThrow(ParseError)
  })
})
