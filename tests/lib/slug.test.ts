import { describe, it, expect } from 'bun:test'
import { deriveSlug } from '../../src/lib/slug'

describe('deriveSlug', () => {
  it('strips tabularis- prefix and -plugin suffix', () => {
    expect(deriveSlug('tabularis-duckdb-plugin')).toBe('duckdb')
  })
  it('strips only -plugin suffix if no tabularis- prefix', () => {
    expect(deriveSlug('redis-plugin')).toBe('redis')
  })
  it('lowercases', () => {
    expect(deriveSlug('DuckDB')).toBe('duckdb')
  })
  it('replaces invalid chars with hyphens', () => {
    expect(deriveSlug('my_plugin_name')).toBe('my-plugin-name')
  })
  it('collapses multiple hyphens', () => {
    expect(deriveSlug('tabularis--duckdb--plugin')).toBe('duckdb')
  })
  it('trims leading and trailing hyphens', () => {
    expect(deriveSlug('-weird-name-')).toBe('weird-name')
  })
  it('handles plain name with no affixes', () => {
    expect(deriveSlug('clickhouse')).toBe('clickhouse')
  })
})
