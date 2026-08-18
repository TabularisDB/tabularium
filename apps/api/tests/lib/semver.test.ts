import { describe, it, expect } from 'bun:test'
import { compareSemver, isStrictSemver, assertStrictSemver, tagToVersion, InvalidVersionError } from '../../src/lib/semver'

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

describe('compareSemver', () => {
  it('orders plain releases', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0)
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0)
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
    expect(compareSemver('0.10.0', '0.2.0')).toBeGreaterThan(0)
  })

  // Regression: coerce() without includePrerelease collapses every
  // 1.0.0-beta.N to 1.0.0, so latestVersion froze at the first beta of a
  // series while later betas kept ingesting as ordinary releases.
  it('orders prereleases of the same version', () => {
    expect(compareSemver('1.0.0-beta.7', '1.0.0-beta.5')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0-beta.5', '1.0.0-beta.7')).toBeLessThan(0)
    expect(compareSemver('1.0.0-beta.10', '1.0.0-beta.9')).toBeGreaterThan(0)
  })

  it('ranks a stable release above its own prerelease', () => {
    expect(compareSemver('2.0.0', '2.0.0-rc.1')).toBeGreaterThan(0)
    expect(compareSemver('2.0.0-rc.1', '2.0.0')).toBeLessThan(0)
  })

  it('still coerces lax legacy tags', () => {
    expect(compareSemver('v1.2', '1.1')).toBeGreaterThan(0)
    expect(compareSemver('1.2', '1.2.0')).toBe(0)
  })

  it('returns 0 for unparseable input', () => {
    expect(compareSemver('garbage', '1.0.0')).toBe(0)
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
