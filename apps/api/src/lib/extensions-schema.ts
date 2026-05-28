// Pure validator for the admin-supplied `extensions:` JSON-Schema delta.
// Lives in its own module so both manifest-schema.ts and kinds.ts can import
// it without creating an import cycle (kinds → schema → kinds).
import { ManifestSchema } from '@tabularium/manifest'
import type { ExtensionsDelta, JsonSchemaProperty } from '@tabularium/manifest'
import { SUPPORTED_LOCALES, type Locale } from './i18n'

export type { ExtensionsDelta, JsonSchemaProperty }

const PROP_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/
const MAX_PROPS = 64
const MAX_DEPTH = 8
const MAX_DESCRIPTION_LEN = 2000
const MAX_TITLE_LEN = 200
const MAX_PATTERN_LEN = 500

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function safetyCheck(node: unknown, depth: number, path: string): void {
  if (depth > MAX_DEPTH) throw new Error(`${path}: nesting exceeds max depth of ${MAX_DEPTH}`)
  if (!isPlainObject(node)) throw new Error(`${path}: must be an object`)
  if ('$ref' in node) throw new Error(`${path}: $ref is not allowed`)
  if (typeof node.description === 'string' && node.description.length > MAX_DESCRIPTION_LEN) {
    throw new Error(`${path}.description: exceeds ${MAX_DESCRIPTION_LEN} chars`)
  }
  if (typeof node.title === 'string' && node.title.length > MAX_TITLE_LEN) {
    throw new Error(`${path}.title: exceeds ${MAX_TITLE_LEN} chars`)
  }
  if (typeof node.pattern === 'string' && node.pattern.length > MAX_PATTERN_LEN) {
    throw new Error(`${path}.pattern: exceeds ${MAX_PATTERN_LEN} chars`)
  }
  validateXTranslations(node, path)
  if (isPlainObject(node.items)) safetyCheck(node.items, depth + 1, `${path}.items`)
  if (isPlainObject(node.properties)) {
    const entries = Object.entries(node.properties)
    if (entries.length > MAX_PROPS) throw new Error(`${path}.properties: more than ${MAX_PROPS} keys`)
    for (const [name, sub] of entries) {
      safetyCheck(sub, depth + 1, `${path}.properties.${name}`)
    }
  }
}

function validateXTranslations(node: Record<string, unknown>, path: string): void {
  const raw = (node as Record<string, unknown>)['x-translations']
  if (raw === undefined) return
  if (!isPlainObject(raw)) {
    throw new Error(`${path}.x-translations must be a plain object`)
  }
  for (const [locale, value] of Object.entries(raw)) {
    if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
      throw new Error(`${path}.x-translations: unsupported locale "${locale}"`)
    }
    if (typeof value !== 'string') {
      throw new Error(`${path}.x-translations.${locale} must be a string`)
    }
    if (value.length > MAX_DESCRIPTION_LEN) {
      throw new Error(`${path}.x-translations.${locale} exceeds ${MAX_DESCRIPTION_LEN} chars`)
    }
  }
}

function unwrapRootSchema(input: Record<string, unknown>): Record<string, unknown> {
  const hasProperties = isPlainObject(input.properties)
  const looksLikeRoot =
    hasProperties &&
    ('$schema' in input ||
      '$id' in input ||
      input.type === 'object' ||
      'title' in input ||
      'additionalProperties' in input)
  if (looksLikeRoot) return input.properties as Record<string, unknown>
  return input
}

export function validateExtensionsDelta(input: unknown): ExtensionsDelta {
  if (input === null || input === undefined) return {}
  if (!isPlainObject(input)) throw new Error('extensions must be an object')
  const unwrapped = unwrapRootSchema(input)
  const entries = Object.entries(unwrapped)
  if (entries.length > MAX_PROPS) throw new Error(`extensions: more than ${MAX_PROPS} top-level properties`)
  const coreKeys = new Set(Object.keys((ManifestSchema as { properties: Record<string, unknown> }).properties))
  const out: ExtensionsDelta = {}
  for (const [name, node] of entries) {
    if (coreKeys.has(name)) continue
    if (!PROP_NAME_RE.test(name) || name.length > 60) {
      throw new Error(`extensions.${name}: invalid property name`)
    }
    if (!isPlainObject(node)) throw new Error(`extensions.${name}: must be a JSON Schema object`)
    safetyCheck(node, 1, `extensions.${name}`)
    out[name] = node as JsonSchemaProperty
  }
  return out
}
