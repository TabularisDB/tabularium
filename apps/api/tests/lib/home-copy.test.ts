import { describe, it, expect, beforeEach } from 'bun:test'
import {
  defaultHomeCopy,
  getHomeCopy,
  setHomeCopy,
  validateHomeCopy,
  HomeCopyValidationError,
  MAX_TEXT_LEN,
} from '../../src/lib/home-copy'
import { clearDb } from '../helpers'

describe('home-copy lib', () => {
  beforeEach(clearDb)

  it('returns defaults when no setting is stored', () => {
    const copy = getHomeCopy()
    expect(copy).toEqual(defaultHomeCopy())
    expect(copy.eyebrow.enabled).toBe(true)
    expect(copy.features.enabled).toBe(true)
  })

  it('round-trips through setHomeCopy / getHomeCopy', async () => {
    const next = defaultHomeCopy()
    next.eyebrow.enabled = false
    next.eyebrow.text.en = 'Custom eyebrow'
    next.features.dropin.title.de = 'Plug-and-play'
    await setHomeCopy(next)
    const got = getHomeCopy()
    expect(got.eyebrow.enabled).toBe(false)
    expect(got.eyebrow.text.en).toBe('Custom eyebrow')
    expect(got.features.dropin.title.de).toBe('Plug-and-play')
    expect(got.features.dropin.title.en).toBeUndefined()
  })

  it('strips empty strings on persistence', async () => {
    const next = defaultHomeCopy()
    next.eyebrow.text.en = '   '
    next.features.providers.body.fr = ''
    await setHomeCopy(next)
    const got = getHomeCopy()
    expect(got.eyebrow.text.en).toBeUndefined()
    expect(got.features.providers.body.fr).toBeUndefined()
  })

  it('validateHomeCopy rejects oversized strings', () => {
    const next = defaultHomeCopy()
    next.eyebrow.text.en = 'x'.repeat(MAX_TEXT_LEN + 1)
    expect(() => validateHomeCopy(next)).toThrow(HomeCopyValidationError)
  })

  it('validateHomeCopy rejects unsupported locales', () => {
    const next: Record<string, unknown> = defaultHomeCopy()
    ;(next.eyebrow as { text: Record<string, string> }).text = { 'xx-YY': 'hi' }
    expect(() => validateHomeCopy(next)).toThrow(HomeCopyValidationError)
  })

  it('validateHomeCopy rejects non-boolean enabled', () => {
    const bad = defaultHomeCopy() as unknown as { eyebrow: { enabled: unknown } }
    bad.eyebrow.enabled = 'yes'
    expect(() => validateHomeCopy(bad)).toThrow(HomeCopyValidationError)
  })

  it('validateHomeCopy accepts defaults', () => {
    expect(() => validateHomeCopy(defaultHomeCopy())).not.toThrow()
  })

  it('falls back to defaults on JSON parse error', async () => {
    const { setSetting } = await import('../../src/lib/settings')
    await setSetting('home_copy', '{not json')
    const got = getHomeCopy()
    expect(got).toEqual(defaultHomeCopy())
  })
})
