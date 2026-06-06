import { describe, it, expect } from 'bun:test'
import { isStrictSemver, assertStrictSemver, tagToVersion, InvalidVersionError } from '../../src/lib/semver'

describe('isStrictSemver', () => {
  it('accepts X.Y.Z', () => {
    expect(isStrictSemver('1.2.3')).toBe(true)
    expect(isStrictSemver('0.0.0')).toBe(true)
    expect(isStrictSemver('10.20.30')).toBe(true)
  })
  it('accepts pre-release', () => {
    expect(isStrictSemver('1.2.3-alpha')).toBe(true)
    expect(isStrictSemver('1.2.3-alpha.1')).toBe(true)
    expect(isStrictSemver('1.2.3-rc.0')).toBe(true)
  })
  it('accepts build metadata', () => {
    expect(isStrictSemver('1.2.3+build.5')).toBe(true)
    expect(isStrictSemver('1.2.3-alpha+build')).toBe(true)
  })
  it('rejects v prefix', () => {
    expect(isStrictSemver('v1.2.3')).toBe(false)
  })
  it('rejects partial versions', () => {
    expect(isStrictSemver('1')).toBe(false)
    expect(isStrictSemver('1.2')).toBe(false)
    expect(isStrictSemver('1.2.3.4')).toBe(false)
  })
  it('rejects non-numeric and garbage', () => {
    expect(isStrictSemver('release-2024-01')).toBe(false)
    expect(isStrictSemver('foo')).toBe(false)
    expect(isStrictSemver('')).toBe(false)
  })
})

describe('assertStrictSemver', () => {
  it('throws InvalidVersionError for bad input', () => {
    expect(() => assertStrictSemver('v1.2')).toThrow(InvalidVersionError)
    expect(() => assertStrictSemver('garbage')).toThrow(InvalidVersionError)
  })
  it('does not throw for good input', () => {
    expect(() => assertStrictSemver('1.2.3')).not.toThrow()
    expect(() => assertStrictSemver('1.2.3-alpha+build')).not.toThrow()
  })
})

describe('tagToVersion', () => {
  it('strips a single leading v', () => {
    expect(tagToVersion('v1.2.3')).toBe('1.2.3')
    expect(tagToVersion('1.2.3')).toBe('1.2.3')
  })
  it('preserves pre-release and build', () => {
    expect(tagToVersion('v1.2.3-rc.1')).toBe('1.2.3-rc.1')
    expect(tagToVersion('v1.2.3-rc.1+build.5')).toBe('1.2.3-rc.1+build.5')
  })
  it('throws on non-semver tag', () => {
    expect(() => tagToVersion('release-2024')).toThrow(InvalidVersionError)
    expect(() => tagToVersion('v1.2')).toThrow(InvalidVersionError)
    expect(() => tagToVersion('latest')).toThrow(InvalidVersionError)
  })
})
