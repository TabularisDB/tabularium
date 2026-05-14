import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import {
  validateKindDef,
  getKinds,
  getKind,
  isKindKey,
  KindError,
  createKind,
  updateKind,
  deleteKind,
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

  it('rejects label longer than 60 chars', () => {
    expect(() => validateKindDef({ key: 'k', label: 'L'.repeat(61) })).toThrow(KindError)
  })

  it('rejects description longer than 280 chars', () => {
    expect(() => validateKindDef({ key: 'k', label: 'L', description: 'd'.repeat(281) })).toThrow(KindError)
  })

  it('rejects non-object input', () => {
    expect(() => validateKindDef(null)).toThrow(KindError)
    expect(() => validateKindDef('theme')).toThrow(KindError)
  })

  it('accepts key at the 40-char limit', () => {
    const key = 'a' + 'b'.repeat(39)
    expect(validateKindDef({ key, label: 'X' }).key).toBe(key)
  })

  it('accepts label at the 60-char limit', () => {
    const label = 'L'.repeat(60)
    expect(validateKindDef({ key: 'k', label }).label).toBe(label)
  })

  it('accepts description at the 280-char limit', () => {
    const description = 'd'.repeat(280)
    expect(validateKindDef({ key: 'k', label: 'L', description }).description).toBe(description)
  })

  it('rejects uppercase letters in key', () => {
    expect(() => validateKindDef({ key: 'Theme', label: 'X' })).toThrow(KindError)
  })

  it('rejects whitespace-only key or label', () => {
    expect(() => validateKindDef({ key: '   ', label: 'X' })).toThrow(KindError)
    expect(() => validateKindDef({ key: 'k', label: '   ' })).toThrow(KindError)
  })

  it('trims surrounding whitespace from key and label', () => {
    const out = validateKindDef({ key: '  theme  ', label: '  Themes  ' })
    expect(out.key).toBe('theme')
    expect(out.label).toBe('Themes')
  })

  it('coerces empty-string description to null', () => {
    expect(validateKindDef({ key: 'k', label: 'L', description: '' }).description).toBeNull()
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

describe('createKind', () => {
  beforeEach(clearDb)

  it('appends a new kind', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    expect(getKinds()).toEqual([{ key: 'theme', label: 'Themes', description: null }])
  })

  it('rejects duplicate key with KindError("duplicate")', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    try {
      await createKind({ key: 'theme', label: 'Other', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(KindError)
      expect((err as KindError).code).toBe('duplicate')
    }
  })

  it('enforces 64-entry cap', async () => {
    for (let i = 0; i < 64; i++) {
      await createKind({ key: `k${i}`, label: `K${i}`, description: null })
    }
    try {
      await createKind({ key: 'overflow', label: 'X', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('invalid')
    }
  })
})

describe('updateKind', () => {
  beforeEach(clearDb)

  it('replaces label/description for an existing key', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const updated = await updateKind('theme', { key: 'theme', label: 'Visual Themes', description: 'fancy' })
    expect(updated.label).toBe('Visual Themes')
    expect(getKind('theme')?.description).toBe('fancy')
  })

  it('rejects body key mismatch with KindError("invalid")', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    try {
      await updateKind('theme', { key: 'other', label: 'X', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('invalid')
    }
  })

  it('rejects unknown key with KindError("not_found")', async () => {
    try {
      await updateKind('nope', { key: 'nope', label: 'X', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('not_found')
    }
  })
})

describe('deleteKind', () => {
  beforeEach(clearDb)

  it('removes the entry', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await deleteKind('theme')
    expect(getKinds()).toEqual([])
  })

  it('second delete throws KindError("not_found")', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await deleteKind('theme')
    try {
      await deleteKind('theme')
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('not_found')
    }
  })
})
