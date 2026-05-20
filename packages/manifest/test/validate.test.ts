import { describe, it, expect } from 'bun:test'
import { ManifestSchema } from '../src/core'
import { buildSchema } from '../src/schema'
import { validateManifest } from '../src/index'

describe('validateManifest', () => {
  const baseSchema = buildSchema({ coreSchema: ManifestSchema as never })

  it('returns ok:true and normalized output for a valid manifest', () => {
    const result = validateManifest({ name: 'my-plugin', kind: 'theme' }, baseSchema)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.normalized.name).toBe('my-plugin')
      expect(result.errors).toEqual([])
    }
  })

  it('strips additional properties (lenient) when normalizing', () => {
    const result = validateManifest({ name: 'x', extra: 'nope' }, baseSchema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const e = result.errors.find((e) => e.code === 'additionalProperties')
      expect(e?.path).toBe('/extra')
    }
  })

  it('does not mutate the input object', () => {
    const input = { name: 'x', extra: 'nope' }
    validateManifest(input, baseSchema)
    expect(input).toEqual({ name: 'x', extra: 'nope' })
  })

  it('returns structured errors for type mismatches', () => {
    const result = validateManifest({ name: 42 }, baseSchema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const e = result.errors.find((x) => x.path === '/name')
      expect(e?.code).toBe('type')
      expect(e?.expected).toBe('string')
      expect(e?.actual).toBe(42)
    }
  })

  it('returns structured errors for pattern mismatches', () => {
    const result = validateManifest({ kind: 'BAD KIND' }, baseSchema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === '/kind' && e.code === 'pattern')).toBe(true)
    }
  })

  it('lenient mode strips unknown fields without erroring', () => {
    const result = validateManifest({ name: 'x', 'x-unknown': 'extra' }, baseSchema, { lenient: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.normalized.name).toBe('x')
      expect((result.normalized as Record<string, unknown>)['x-unknown']).toBeUndefined()
    }
  })

  it('lenient mode still errors on type mismatches', () => {
    const result = validateManifest({ name: 42 }, baseSchema, { lenient: true })
    expect(result.ok).toBe(false)
  })

  it('honours allOf/if/then kind routing', () => {
    const schema = buildSchema({
      coreSchema: ManifestSchema as never,
      kindOverrides: {
        theme: { 'x-theme': { type: 'string' } },
      },
    })
    const ok = validateManifest({ kind: 'theme', 'x-theme': 'light' }, schema)
    expect(ok.ok).toBe(true)

    const bad = validateManifest({ kind: 'theme', 'x-theme': 42 }, schema)
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.errors.some((e) => e.path === '/x-theme' && e.code === 'type')).toBe(true)
    }
  })
})
