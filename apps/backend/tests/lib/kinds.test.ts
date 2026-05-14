import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import {
  validateKindDef,
  getKinds,
  getKind,
  isKindKey,
  KindError,
} from '../../src/lib/kinds'

describe('validateKindDef', () => {
  it('accepts minimal valid input', () => {
    const out = validateKindDef({ key: 'theme', label: 'Themes' })
    expect(out).toEqual({ key: 'theme', label: 'Themes', description: null })
  })

  it('accepts description as string or null', () => {
    expect(validateKindDef({ key: 'a', label: 'A', description: 'd' }).description).toBe('d')
    expect(validateKindDef({ key: 'a', label: 'A', description: null }).description).toBeNull()
  })

  it('rejects non-slug key', () => {
    expect(() => validateKindDef({ key: 'Bad Key!', label: 'X' })).toThrow(KindError)
  })

  it('rejects empty label', () => {
    expect(() => validateKindDef({ key: 'ok', label: '' })).toThrow(KindError)
  })

  it('rejects oversized fields', () => {
    expect(() => validateKindDef({ key: 'k', label: 'L'.repeat(61) })).toThrow(KindError)
    expect(() => validateKindDef({ key: 'k', label: 'L', description: 'd'.repeat(281) })).toThrow(KindError)
  })

  it('rejects non-object input', () => {
    expect(() => validateKindDef(null)).toThrow(KindError)
    expect(() => validateKindDef('theme')).toThrow(KindError)
  })
})

describe('reads', () => {
  beforeEach(clearDb)

  it('getKinds returns [] when unset', () => {
    expect(getKinds()).toEqual([])
  })

  it('getKinds returns [] when setting is malformed JSON', async () => {
    await setSetting('plugin_kinds', 'not json')
    expect(getKinds()).toEqual([])
  })

  it('getKind returns the matching def or null', async () => {
    await setSetting('plugin_kinds', JSON.stringify([
      { key: 'theme', label: 'Themes', description: null },
    ]))
    expect(getKind('theme')?.label).toBe('Themes')
    expect(getKind('nope')).toBeNull()
  })

  it('isKindKey matches active keys', async () => {
    await setSetting('plugin_kinds', JSON.stringify([
      { key: 'theme', label: 'Themes', description: null },
    ]))
    expect(isKindKey('theme')).toBe(true)
    expect(isKindKey('snippet')).toBe(false)
  })
})
