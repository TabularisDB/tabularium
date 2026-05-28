import { getSetting, setSetting, deleteSetting, hasSetting } from './settings'
import { SUPPORTED_LOCALES, type Locale, getI18nConfig } from './i18n'
import { renderMarkdown } from './markdown'

type LocalizedString = Partial<Record<Locale, string>>

const FIXED_POSITIONS = [
  'page_top',
  'page_bottom',
  'before_core',
  'after_core',
  'before_extensions',
  'after_extensions',
  'before_kinds',
  'after_kinds',
  'before_api',
  'after_api',
] as const
type FixedPosition = (typeof FIXED_POSITIONS)[number]
type KindPosition = { kind: string; slot: 'before' | 'after' }
export type PositionMarker = FixedPosition | KindPosition

export type CustomSection = {
  id: string
  title: string | null
  titleTranslations?: LocalizedString
  body: string
  bodyTranslations?: LocalizedString
  position: PositionMarker
}

export type DocsConfig = {
  introMarkdown: string | null
  introMarkdownTranslations: Partial<Record<Locale, string>>
  outroMarkdown: string | null
  outroMarkdownTranslations: Partial<Record<Locale, string>>
  customSections: CustomSection[]
}

export type LocalizedDocsConfig = {
  intro: { bodyMarkdown: string | null; bodyHtml: string | null }
  outro: { bodyMarkdown: string | null; bodyHtml: string | null }
  sections: Array<{
    id: string
    title: string | null
    body: string
    bodyHtml: string
    position: PositionMarker
  }>
}

export class DocsCustomError extends Error {
  constructor(
    public code: 'invalid' | 'duplicate' | 'not_found',
    message: string,
  ) {
    super(message)
    this.name = 'DocsCustomError'
  }
}

const MARKDOWN_MAX = 16000
const SECTION_TITLE_MAX = 200
const SECTION_ID_RE = /^[a-z0-9][a-z0-9-]*$/
const SECTION_ID_MAX = 60
const MAX_SECTIONS = 64

function readTranslations(baseKey: string): Partial<Record<Locale, string>> {
  const out: Partial<Record<Locale, string>> = {}
  for (const l of SUPPORTED_LOCALES) {
    const v = getSetting(`${baseKey}.${l}`)
    if (v !== undefined) out[l] = v
  }
  return out
}

function pickLocalized(
  base: string | null,
  map: LocalizedString | undefined,
  locale: Locale,
): string | null {
  const defaultLocale = getI18nConfig().defaultLocale
  const v = map?.[locale] ?? (locale !== defaultLocale ? map?.[defaultLocale] : undefined)
  return typeof v === 'string' && v.length > 0 ? v : base
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validatePosition(v: unknown): PositionMarker {
  if (typeof v === 'string' && (FIXED_POSITIONS as readonly string[]).includes(v)) {
    return v as FixedPosition
  }
  if (
    isPlainObject(v) &&
    typeof v.kind === 'string' &&
    v.kind.length > 0 &&
    (v.slot === 'before' || v.slot === 'after')
  ) {
    return { kind: v.kind, slot: v.slot }
  }
  throw new DocsCustomError('invalid', `unknown position: ${JSON.stringify(v)}`)
}

function validateTranslationMap(
  value: unknown,
  max: number,
  field: string,
): LocalizedString | undefined {
  if (value === undefined || value === null) return undefined
  if (!isPlainObject(value)) throw new DocsCustomError('invalid', `${field} must be an object`)
  const out: LocalizedString = {}
  for (const [locale, raw] of Object.entries(value)) {
    if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
      throw new DocsCustomError('invalid', `${field}: unsupported locale "${locale}"`)
    }
    if (raw === undefined || raw === null || raw === '') continue
    if (typeof raw !== 'string') {
      throw new DocsCustomError('invalid', `${field}.${locale} must be a string`)
    }
    if (raw.length > max) {
      throw new DocsCustomError('invalid', `${field}.${locale} exceeds ${max} chars`)
    }
    out[locale as Locale] = raw
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function validateCustomSection(input: unknown): CustomSection {
  if (!isPlainObject(input)) throw new DocsCustomError('invalid', 'section must be an object')
  const o = input as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  if (!id || id.length > SECTION_ID_MAX || !SECTION_ID_RE.test(id)) {
    throw new DocsCustomError(
      'invalid',
      `id must match ${SECTION_ID_RE} (max ${SECTION_ID_MAX} chars)`,
    )
  }
  const titleRaw = o.title
  let title: string | null = null
  if (titleRaw !== undefined && titleRaw !== null && titleRaw !== '') {
    if (typeof titleRaw !== 'string') {
      throw new DocsCustomError('invalid', 'title must be a string or null')
    }
    if (titleRaw.length > SECTION_TITLE_MAX) {
      throw new DocsCustomError('invalid', `title max ${SECTION_TITLE_MAX} chars`)
    }
    title = titleRaw
  }
  const titleTranslations = validateTranslationMap(
    o.titleTranslations,
    SECTION_TITLE_MAX,
    'titleTranslations',
  )

  if (typeof o.body !== 'string' || o.body.length === 0) {
    throw new DocsCustomError('invalid', 'body must be a non-empty string')
  }
  if (o.body.length > MARKDOWN_MAX) {
    throw new DocsCustomError('invalid', `body max ${MARKDOWN_MAX} chars`)
  }
  const body = o.body
  const bodyTranslations = validateTranslationMap(
    o.bodyTranslations,
    MARKDOWN_MAX,
    'bodyTranslations',
  )

  const position = validatePosition(o.position)

  return {
    id,
    title,
    ...(titleTranslations ? { titleTranslations } : {}),
    body,
    ...(bodyTranslations ? { bodyTranslations } : {}),
    position,
  }
}

function readSections(): CustomSection[] {
  const raw = getSetting('docs.custom_sections')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((p): CustomSection | null => {
        try {
          return validateCustomSection(p)
        } catch {
          return null
        }
      })
      .filter((x): x is CustomSection => x !== null)
  } catch {
    return []
  }
}

export function getDocsConfig(): DocsConfig {
  return {
    introMarkdown: getSetting('docs.intro_markdown') ?? null,
    introMarkdownTranslations: readTranslations('docs.intro_markdown'),
    outroMarkdown: getSetting('docs.outro_markdown') ?? null,
    outroMarkdownTranslations: readTranslations('docs.outro_markdown'),
    customSections: readSections(),
  }
}

export function getLocalizedDocsConfig(locale: Locale): LocalizedDocsConfig {
  const cfg = getDocsConfig()
  const introBody = pickLocalized(cfg.introMarkdown, cfg.introMarkdownTranslations, locale)
  const outroBody = pickLocalized(cfg.outroMarkdown, cfg.outroMarkdownTranslations, locale)
  return {
    intro: {
      bodyMarkdown: introBody,
      bodyHtml: introBody ? renderMarkdown(introBody) : null,
    },
    outro: {
      bodyMarkdown: outroBody,
      bodyHtml: outroBody ? renderMarkdown(outroBody) : null,
    },
    sections: cfg.customSections.map((s) => {
      const title = pickLocalized(s.title, s.titleTranslations, locale)
      const body = pickLocalized(s.body, s.bodyTranslations, locale) ?? ''
      return {
        id: s.id,
        title,
        body,
        bodyHtml: renderMarkdown(body),
        position: s.position,
      }
    }),
  }
}

async function writeTranslations(
  baseKey: string,
  map: Partial<Record<Locale, string>>,
): Promise<void> {
  for (const l of SUPPORTED_LOCALES) {
    const key = `${baseKey}.${l}`
    const v = map[l]
    if (v === undefined || v === null || v === '') {
      if (hasSetting(key)) await deleteSetting(key)
    } else {
      if (typeof v !== 'string') {
        throw new DocsCustomError('invalid', `${baseKey}.${l} must be a string`)
      }
      if (v.length > MARKDOWN_MAX) {
        throw new DocsCustomError('invalid', `${baseKey}.${l} exceeds ${MARKDOWN_MAX} chars`)
      }
      await setSetting(key, v)
    }
  }
}

export async function setIntroMarkdown(
  body: string | null,
  translations: Partial<Record<Locale, string>>,
): Promise<void> {
  if (body && body.length > MARKDOWN_MAX) {
    throw new DocsCustomError('invalid', `body exceeds ${MARKDOWN_MAX} chars`)
  }
  if (body === null || body === '') {
    if (hasSetting('docs.intro_markdown')) await deleteSetting('docs.intro_markdown')
  } else {
    await setSetting('docs.intro_markdown', body)
  }
  await writeTranslations('docs.intro_markdown', translations)
}

export async function setOutroMarkdown(
  body: string | null,
  translations: Partial<Record<Locale, string>>,
): Promise<void> {
  if (body && body.length > MARKDOWN_MAX) {
    throw new DocsCustomError('invalid', `body exceeds ${MARKDOWN_MAX} chars`)
  }
  if (body === null || body === '') {
    if (hasSetting('docs.outro_markdown')) await deleteSetting('docs.outro_markdown')
  } else {
    await setSetting('docs.outro_markdown', body)
  }
  await writeTranslations('docs.outro_markdown', translations)
}

async function writeSections(sections: CustomSection[]): Promise<void> {
  if (sections.length > MAX_SECTIONS) {
    throw new DocsCustomError('invalid', `at most ${MAX_SECTIONS} sections allowed`)
  }
  await setSetting('docs.custom_sections', JSON.stringify(sections))
}

export async function addCustomSection(section: CustomSection): Promise<CustomSection> {
  const v = validateCustomSection(section)
  const current = readSections()
  if (current.some((s) => s.id === v.id)) {
    throw new DocsCustomError('duplicate', `section "${v.id}" already exists`)
  }
  await writeSections([...current, v])
  return v
}

export async function updateCustomSection(
  id: string,
  section: CustomSection,
): Promise<CustomSection> {
  const v = validateCustomSection(section)
  if (v.id !== id) throw new DocsCustomError('invalid', 'body id must match path id')
  const current = readSections()
  const idx = current.findIndex((s) => s.id === id)
  if (idx === -1) throw new DocsCustomError('not_found', `section "${id}" not found`)
  const next = current.slice()
  next[idx] = v
  await writeSections(next)
  return v
}

export async function removeCustomSection(id: string): Promise<void> {
  const current = readSections()
  if (!current.some((s) => s.id === id)) {
    throw new DocsCustomError('not_found', `section "${id}" not found`)
  }
  await writeSections(current.filter((s) => s.id !== id))
}
