import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { initSettings, setSetting } from '../../src/lib/settings'
import { getAppUrlSchemes, setAppUrlSchemes, pickSchemeForKind } from '../../src/lib/app-schemes'

describe('app-schemes lib', () => {
  beforeEach(async () => {
    await clearDb()
    await initSettings()
  })

  it('returns empty array when the setting is missing', () => {
    expect(getAppUrlSchemes()).toEqual([])
  })

  it('round-trips a typed list through setAppUrlSchemes + getAppUrlSchemes', async () => {
    await setAppUrlSchemes([
      { name: 'Tabularis Desktop', scheme: 'tabularis' },
      { name: 'Theme Studio', scheme: 'theme-studio', kinds: ['theme'] },
    ])
    const out = getAppUrlSchemes()
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ name: 'Tabularis Desktop', scheme: 'tabularis' })
    expect(out[1]).toEqual({ name: 'Theme Studio', scheme: 'theme-studio', kinds: ['theme'] })
  })

  it('drops invalid entries instead of throwing', async () => {
    // Raw setting injection bypasses setAppUrlSchemes' filter to simulate
    // a hand-edited DB row or an old/corrupt value.
    await setSetting(
      'registry.app_url_schemes',
      JSON.stringify([
        { name: 'Good', scheme: 'good' },
        { name: '', scheme: 'empty-name' },
        { name: 'Bad scheme', scheme: '1invalid' },
        'not-an-object',
        { name: 'Kinds wrong', scheme: 'ok', kinds: [1, 2, 3] },
      ]),
    )
    const out = getAppUrlSchemes()
    expect(out).toEqual([{ name: 'Good', scheme: 'good' }])
  })

  it('returns empty when the raw value is not JSON', async () => {
    await setSetting('registry.app_url_schemes', 'not-json')
    expect(getAppUrlSchemes()).toEqual([])
  })

  describe('pickSchemeForKind', () => {
    const schemes = [
      { name: 'Theme Studio', scheme: 'theme-studio', kinds: ['theme'] },
      { name: 'Widget Lab', scheme: 'widget-lab', kinds: ['widget', 'panel'] },
      { name: 'Tabularis Desktop', scheme: 'tabularis' },
    ]

    it('picks the kind-specific scheme first', () => {
      expect(pickSchemeForKind(schemes, 'theme')?.scheme).toBe('theme-studio')
      expect(pickSchemeForKind(schemes, 'widget')?.scheme).toBe('widget-lab')
      expect(pickSchemeForKind(schemes, 'panel')?.scheme).toBe('widget-lab')
    })

    it('falls back to the wildcard scheme when no kind matches', () => {
      expect(pickSchemeForKind(schemes, 'automation')?.scheme).toBe('tabularis')
    })

    it('returns null when no scheme matches and no wildcard exists', () => {
      expect(pickSchemeForKind([{ name: 'Only Themes', scheme: 'only-themes', kinds: ['theme'] }], 'widget')).toBeNull()
    })

    it('returns null on empty list', () => {
      expect(pickSchemeForKind([], 'theme')).toBeNull()
    })
  })
})
