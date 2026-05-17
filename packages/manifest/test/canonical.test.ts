import { describe, it, expect } from 'bun:test'
import { canonicalize } from '../src/index'

describe('canonicalize (RFC 8785)', () => {
  it('sorts object keys lexicographically (UTF-16 code unit order)', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{\"a\":2,\"b\":1}')
    expect(canonicalize({ z: 1, a: 1, m: 1 })).toBe('{\"a\":1,\"m\":1,\"z\":1}')
  })

  it('is invariant under property insertion order', () => {
    const a = canonicalize({ a: { y: 1, x: 2 }, b: [3, 2, 1] })
    const b = canonicalize({ b: [3, 2, 1], a: { x: 2, y: 1 } })
    expect(a).toBe(b)
  })

  it('strips insignificant whitespace', () => {
    expect(canonicalize({ a: 1 })).not.toContain(' ')
    expect(canonicalize([1, 2])).toBe('[1,2]')
  })

  it('handles RFC 8785 number serialisation (integers + finite doubles)', () => {
    expect(canonicalize(0)).toBe('0')
    expect(canonicalize(-0)).toBe('0')
    expect(canonicalize(1.5)).toBe('1.5')
    expect(canonicalize(1e21)).toBe('1e+21')
  })

  it('rejects NaN / Infinity / non-JSON values', () => {
    expect(() => canonicalize(NaN)).toThrow()
    expect(() => canonicalize(Infinity)).toThrow()
    expect(() => canonicalize(undefined as unknown as null)).toThrow()
  })

  it('escapes the required control characters per the spec', () => {
    expect(canonicalize({ k: '\u0000\n\"' })).toBe('{\"k\":\"\\u0000\\n\\\"\"}')
  })
})
