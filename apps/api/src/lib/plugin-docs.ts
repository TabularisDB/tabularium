import { stringify as yamlStringify, parse as yamlParse } from 'yaml'
import { ManifestSchema } from '@tabularium/manifest'
import type { Locale } from './i18n'
import { getExtensionsDelta } from './manifest-schema'
import { listLocalizedKinds } from './kinds'
import { getLocalizedDocsConfig, type PositionMarker } from './docs-custom'
import { renderMarkdown } from './markdown'
import { env } from './env'

export type { PositionMarker } from './docs-custom'

export type FieldDoc = {
  key: string
  type: string
  required: boolean
  description: string | null
  enumValues?: string[]
  format?: string
  deprecated?: boolean
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
}

type FlattenInput = {
  schema: Record<string, unknown>
  requiredOverride: string[] | null
  locale: Locale
}

function deriveType(node: Record<string, unknown>): { type: string; enumValues?: string[] } {
  if (Array.isArray(node.enum)) {
    return { type: 'enum', enumValues: node.enum.filter((v): v is string => typeof v === 'string') }
  }
  const t = node.type
  if (t === 'array') {
    const items = node.items as Record<string, unknown> | undefined
    const itemType = items ? deriveType(items).type : 'unknown'
    return { type: `array<${itemType}>` }
  }
  if (typeof t === 'string') return { type: t }
  if (Array.isArray(t)) return { type: t.join('|') }
  if (node.properties && typeof node.properties === 'object') return { type: 'object' }
  return { type: 'unknown' }
}

function pickLocalizedDescription(node: Record<string, unknown>, locale: Locale): string | null {
  const translations = node['x-translations']
  if (translations && typeof translations === 'object' && !Array.isArray(translations)) {
    const val = (translations as Record<string, unknown>)[locale]
    if (typeof val === 'string' && val.length > 0) return val
  }
  if (typeof node.description === 'string') return node.description
  return null
}

export function flattenSchemaProps(input: FlattenInput): FieldDoc[] {
  const props = (input.schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const required = input.requiredOverride ?? (input.schema.required as string[] | undefined) ?? []
  const requiredSet = new Set(required)
  const out: FieldDoc[] = []
  for (const [key, node] of Object.entries(props)) {
    const { type, enumValues } = deriveType(node)
    out.push({
      key,
      type,
      required: requiredSet.has(key),
      description: pickLocalizedDescription(node, input.locale),
      ...(enumValues ? { enumValues } : {}),
      ...(typeof node.format === 'string' ? { format: node.format } : {}),
      ...(node.deprecated === true ? { deprecated: true } : {}),
      ...(typeof node.pattern === 'string' ? { pattern: node.pattern } : {}),
      ...(typeof node.minLength === 'number' ? { minLength: node.minLength } : {}),
      ...(typeof node.maxLength === 'number' ? { maxLength: node.maxLength } : {}),
      ...(typeof node.minimum === 'number' ? { minimum: node.minimum } : {}),
      ...(typeof node.maximum === 'number' ? { maximum: node.maximum } : {}),
      ...(typeof node.minItems === 'number' ? { minItems: node.minItems } : {}),
      ...(typeof node.maxItems === 'number' ? { maxItems: node.maxItems } : {}),
    })
  }
  return out
}

type SynthInput = {
  properties: Record<string, Record<string, unknown>>
  fixed?: Record<string, unknown>
}

function placeholderFor(node: Record<string, unknown>): unknown {
  if (node.example !== undefined) return node.example
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0]
  const t = node.type
  if (t === 'string') {
    if (node.format === 'email') return 'name@example.com'
    if (node.format === 'uri' || node.format === 'url') return 'https://example.com'
    return 'example'
  }
  if (t === 'number' || t === 'integer') return 1
  if (t === 'boolean') return true
  if (t === 'array') {
    const items = (node.items as Record<string, unknown> | undefined) ?? {}
    return [placeholderFor(items)]
  }
  if (t === 'object') {
    const sub = (node.properties as Record<string, Record<string, unknown>> | undefined) ?? {}
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(sub)) out[k] = placeholderFor(v)
    return out
  }
  return null
}

export function synthesizeExample(input: SynthInput): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, node] of Object.entries(input.properties)) {
    if (input.fixed && key in input.fixed) {
      out[key] = input.fixed[key]
      continue
    }
    out[key] = placeholderFor(node)
  }
  return out
}

export type KindDocSection = {
  key: string
  label: string
  description: string | null
  publicPageUrl: string | null
  extensionFields: FieldDoc[]
  prosePreHtml: string | null
  prosePostHtml: string | null
}

export type KindExample = {
  kindKey: string
  yaml: string
  json: string
}

type DocHeading = { level: 2 | 3; id: string; text: string }

export type PluginDocs = {
  meta: { generatedAt: number; schemaSourceUrl: string }
  page: { title: string | null; excerpt: string | null }
  intro: { bodyHtml: string | null; headings: DocHeading[] }
  outro: { bodyHtml: string | null; headings: DocHeading[] }
  customSections: Array<{
    id: string
    title: string | null
    bodyHtml: string
    headings: DocHeading[]
    position: PositionMarker
  }>
  coreFields: FieldDoc[]
  globalExtensions: FieldDoc[]
  kinds: KindDocSection[]
  examples: { perKind: KindExample[] }
  apiReference: { openapiSpecUrl: string; openapiUiUrl: string }
}

function buildCustomExample(custom: { yaml?: string; json?: string }): { yaml: string; json: string } | null {
  const yamlRaw = typeof custom.yaml === 'string' && custom.yaml.length > 0 ? custom.yaml : null
  const jsonRaw = typeof custom.json === 'string' && custom.json.length > 0 ? custom.json : null
  if (!yamlRaw && !jsonRaw) return null
  try {
    if (yamlRaw && jsonRaw) return { yaml: yamlRaw, json: jsonRaw }
    if (yamlRaw) {
      const parsed = yamlParse(yamlRaw)
      return { yaml: yamlRaw, json: JSON.stringify(parsed, null, 2) }
    }
    if (jsonRaw) {
      const parsed = JSON.parse(jsonRaw)
      return { yaml: yamlStringify(parsed), json: jsonRaw }
    }
    return null
  } catch {
    return null
  }
}

function deltaToSchema(delta: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const required: string[] = []
  const properties: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(delta)) {
    const node = { ...v }
    if (node.required === true) required.push(k)
    delete node.required
    properties[k] = node
  }
  return { properties, ...(required.length > 0 ? { required } : {}) }
}

export async function buildPluginDocs(opts: { locale: Locale }): Promise<PluginDocs> {
  const coreSchema = ManifestSchema as unknown as Record<string, unknown>
  const coreFields = flattenSchemaProps({ schema: coreSchema, requiredOverride: null, locale: opts.locale })

  const globalDelta = getExtensionsDelta()
  const globalSchema = deltaToSchema(globalDelta as Record<string, Record<string, unknown>>)
  const globalExtensions = flattenSchemaProps({
    schema: globalSchema,
    requiredOverride: null,
    locale: opts.locale,
  })

  const localizedKinds = listLocalizedKinds(opts.locale)
  const kinds: KindDocSection[] = []
  const examples: KindExample[] = []
  for (const kind of localizedKinds) {
    const kindDelta = (kind.extensionsSchema ?? {}) as Record<string, Record<string, unknown>>
    const kindSchema = deltaToSchema(kindDelta)
    const extensionFields = flattenSchemaProps({
      schema: kindSchema,
      requiredOverride: null,
      locale: opts.locale,
    })
    kinds.push({
      key: kind.key,
      label: kind.label,
      description: kind.description,
      publicPageUrl: kind.publicPageEnabled ? `/c/${kind.key}` : null,
      extensionFields,
      prosePreHtml: kind.prosePre ? await renderMarkdown(kind.prosePre) : null,
      prosePostHtml: kind.prosePost ? await renderMarkdown(kind.prosePost) : null,
    })

    const custom = kind.customExample ? buildCustomExample(kind.customExample) : null
    if (custom) {
      examples.push({ kindKey: kind.key, yaml: custom.yaml, json: custom.json })
    } else {
      const mergedProps: Record<string, Record<string, unknown>> = {
        ...((coreSchema.properties as Record<string, Record<string, unknown>>) ?? {}),
        ...(globalSchema.properties as Record<string, Record<string, unknown>>),
        ...(kindSchema.properties as Record<string, Record<string, unknown>>),
      }
      const obj = synthesizeExample({ properties: mergedProps, fixed: { kind: kind.key } })
      examples.push({
        kindKey: kind.key,
        json: JSON.stringify(obj, null, 2),
        yaml: yamlStringify(obj),
      })
    }
  }

  const customCfg = await getLocalizedDocsConfig(opts.locale)

  const baseUrl = env.BASE_URL.replace(/\/$/, '')
  return {
    meta: { generatedAt: Date.now(), schemaSourceUrl: `${baseUrl}/manifest.schema.json` },
    page: customCfg.page,
    intro: { bodyHtml: customCfg.intro.bodyHtml, headings: customCfg.intro.headings },
    outro: { bodyHtml: customCfg.outro.bodyHtml, headings: customCfg.outro.headings },
    customSections: customCfg.sections.map((s) => ({
      id: s.id,
      title: s.title,
      bodyHtml: s.bodyHtml,
      headings: s.headings,
      position: s.position,
    })),
    coreFields,
    globalExtensions,
    kinds,
    examples: { perKind: examples },
    apiReference: {
      openapiSpecUrl: `${baseUrl}/openapi/json`,
      openapiUiUrl: `${baseUrl}/openapi`,
    },
  }
}

function fieldTableMd(fields: FieldDoc[]): string {
  if (fields.length === 0) return '_None._\n'
  const head = '| Field | Type | Required | Description |\n|---|---|---|---|\n'
  const rows = fields
    .map((f) => {
      const type = f.enumValues?.length ? f.enumValues.map((v) => `\`${v}\``).join(' \\| ') : `\`${f.type}\``
      const required = f.required ? '✅' : '—'
      const desc = (f.description ?? '').replace(/\n+/g, ' ').replace(/\|/g, '\\|')
      return `| \`${f.key}\` | ${type} | ${required} | ${desc} |`
    })
    .join('\n')
  return `${head}${rows}\n`
}

function sectionMd(title: string | null, body: string): string {
  if (!body) return ''
  return title ? `## ${title}\n\n${body}\n` : `${body}\n`
}

export async function assembleDocsMarkdown(locale: Locale): Promise<string> {
  const docs = await buildPluginDocs({ locale })
  const customCfg = await getLocalizedDocsConfig(locale)

  const parts: string[] = []

  const fmTitle = docs.page.title
  const fmExcerpt = docs.page.excerpt
  if (fmTitle || fmExcerpt) {
    const lines = ['---']
    if (fmTitle) lines.push(`title: "${fmTitle.replace(/"/g, '\\"')}"`)
    if (fmExcerpt) lines.push(`excerpt: "${fmExcerpt.replace(/"/g, '\\"')}"`)
    lines.push('---', '')
    parts.push(lines.join('\n'))
  } else if (fmTitle === null && fmExcerpt === null) {
    parts.push('# Plugin Development\n')
  }

  const sectionsBy = (marker: PositionMarker) =>
    customCfg.sections.filter((s) => {
      if (typeof marker === 'string') return typeof s.position === 'string' && s.position === marker
      return typeof s.position === 'object' && s.position.kind === marker.kind && s.position.slot === marker.slot
    })

  // Intro markdown (already had frontmatter stripped by getLocalizedDocsConfig).
  if (customCfg.intro.bodyMarkdown) parts.push(`${customCfg.intro.bodyMarkdown.trim()}\n`)

  // page_top + before_kinds custom sections.
  for (const pos of ['page_top', 'before_kinds'] as const) {
    for (const s of sectionsBy(pos)) parts.push(sectionMd(s.title, s.body))
  }

  // Core manifest schema as a flat table.
  parts.push('## Core manifest fields\n')
  parts.push(fieldTableMd(docs.coreFields))

  // Global extensions if any are registered.
  if (docs.globalExtensions.length > 0) {
    parts.push('\n## Global manifest extensions\n')
    parts.push(fieldTableMd(docs.globalExtensions))
  }

  // Per-kind sections with extensions + examples.
  if (docs.kinds.length > 0) {
    parts.push('\n## Plugin kinds\n')
    for (const kind of docs.kinds) {
      for (const s of sectionsBy({ kind: kind.key, slot: 'before' })) parts.push(sectionMd(s.title, s.body))
      parts.push(`### ${kind.label} (\`${kind.key}\`)\n`)
      if (kind.description) parts.push(`${kind.description}\n`)
      const pre = customCfg.sections.find((s) => false) // placeholder; prose pre/post come below
      void pre
      if (kind.extensionFields.length > 0) {
        parts.push('\n**Extensions**\n')
        parts.push(fieldTableMd(kind.extensionFields))
      }
      const example = docs.examples.perKind.find((e) => e.kindKey === kind.key)
      if (example) {
        parts.push('\n**Example (YAML)**\n')
        parts.push('```yaml\n' + example.yaml.trim() + '\n```\n')
        parts.push('\n**Example (JSON)**\n')
        parts.push('```json\n' + example.json.trim() + '\n```\n')
      }
      for (const s of sectionsBy({ kind: kind.key, slot: 'after' })) parts.push(sectionMd(s.title, s.body))
    }
  }

  // after_kinds + page_bottom.
  for (const pos of ['after_kinds', 'page_bottom'] as const) {
    for (const s of sectionsBy(pos)) parts.push(sectionMd(s.title, s.body))
  }

  if (customCfg.outro.bodyMarkdown) parts.push(`\n${customCfg.outro.bodyMarkdown.trim()}\n`)

  parts.push(`\n---\n_Generated by Tabularium for ${env.BASE_URL.replace(/\/$/, '')}._\n`)

  return parts.join('\n').replace(/\n{3,}/g, '\n\n')
}
