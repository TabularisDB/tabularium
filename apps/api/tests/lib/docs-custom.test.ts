import { describe, it, expect, beforeEach } from 'bun:test'
import {
  getDocsConfig,
  getLocalizedDocsConfig,
  setIntroMarkdown,
  setOutroMarkdown,
  addCustomSection,
  updateCustomSection,
  removeCustomSection,
  validateCustomSection,
} from '../../src/lib/docs-custom'
import { clearDb } from '../helpers'

describe('docs-custom — intro/outro', () => {
  beforeEach(clearDb)

  it('returns null when nothing is set', () => {
    const cfg = getDocsConfig()
    expect(cfg.introMarkdown).toBeNull()
    expect(cfg.outroMarkdown).toBeNull()
    expect(cfg.customSections).toEqual([])
  })

  it('persists intro markdown with translations', async () => {
    await setIntroMarkdown('# Welcome', { de: '# Willkommen' })
    const cfg = getDocsConfig()
    expect(cfg.introMarkdown).toBe('# Welcome')
    expect(cfg.introMarkdownTranslations.de).toBe('# Willkommen')
  })

  it('resolved view returns intro + outro as HTML for requested locale', async () => {
    await setIntroMarkdown('# Hello', { de: '# Hallo' })
    await setOutroMarkdown('Footer.', {})
    const localized = getLocalizedDocsConfig('de')
    expect(localized.intro.bodyMarkdown).toBe('# Hallo')
    expect(localized.intro.bodyHtml).toContain('<h1')
    expect(localized.outro.bodyMarkdown).toBe('Footer.')
    expect(localized.outro.bodyHtml).toContain('Footer.')
  })

  it('falls back to default-locale when translation missing', async () => {
    await setIntroMarkdown('# Hello', {})
    const localized = getLocalizedDocsConfig('de')
    expect(localized.intro.bodyMarkdown).toBe('# Hello')
  })

  it('clears intro when body is null', async () => {
    await setIntroMarkdown('# Hello', { de: '# Hallo' })
    await setIntroMarkdown(null, {})
    const cfg = getDocsConfig()
    expect(cfg.introMarkdown).toBeNull()
    expect(cfg.introMarkdownTranslations).toEqual({})
  })
})

describe('docs-custom — sections', () => {
  beforeEach(clearDb)

  it('validates a section with fixed position', () => {
    const s = validateCustomSection({
      id: 'welcome',
      title: 'Welcome',
      body: '# Hi',
      position: 'page_top',
    })
    expect(s.id).toBe('welcome')
    expect(s.position).toBe('page_top')
  })

  it('validates a kind position', () => {
    const s = validateCustomSection({
      id: 'theme-notes',
      title: null,
      body: 'Notes.',
      position: { kind: 'theme', slot: 'before' },
    })
    expect(s.position).toEqual({ kind: 'theme', slot: 'before' })
  })

  it('rejects invalid id format', () => {
    expect(() => validateCustomSection({ id: 'Bad ID', title: null, body: 'x', position: 'page_top' })).toThrow(/id/)
  })

  it('rejects unknown fixed position', () => {
    expect(() => validateCustomSection({ id: 'x', title: null, body: 'x', position: 'invalid_position' })).toThrow(
      /position/,
    )
  })

  it('rejects invalid kind position (missing slot)', () => {
    expect(() =>
      validateCustomSection({
        id: 'x',
        title: null,
        body: 'x',
        position: { kind: 'theme' },
      }),
    ).toThrow(/position/)
  })

  it('adds, updates, and removes sections', async () => {
    await addCustomSection({
      id: 's1',
      title: 'First',
      body: 'one',
      position: 'page_top',
    })
    expect(getDocsConfig().customSections).toHaveLength(1)

    await updateCustomSection('s1', {
      id: 's1',
      title: 'First updated',
      body: 'one updated',
      position: 'page_top',
    })
    expect(getDocsConfig().customSections[0].title).toBe('First updated')

    await removeCustomSection('s1')
    expect(getDocsConfig().customSections).toEqual([])
  })

  it('prevents duplicate ids in addCustomSection', async () => {
    await addCustomSection({ id: 's', title: null, body: 'x', position: 'page_top' })
    await expect(addCustomSection({ id: 's', title: null, body: 'y', position: 'page_top' })).rejects.toThrow(
      /duplicate|exists/i,
    )
  })

  it('localizes section body to requested locale (with fallback)', async () => {
    await addCustomSection({
      id: 'intro',
      title: 'Intro',
      titleTranslations: { de: 'Einleitung' },
      body: 'English body',
      bodyTranslations: { de: 'Deutscher Text' },
      position: 'page_top',
    })
    const localized = getLocalizedDocsConfig('de')
    const s = localized.sections.find((x) => x.id === 'intro')
    expect(s?.title).toBe('Einleitung')
    expect(s?.body).toBe('Deutscher Text')
    expect(s?.bodyHtml).toContain('Deutscher Text')
  })
})
