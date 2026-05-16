import { type TSchema } from '@sinclair/typebox'
import { ManifestSchema } from '@tabularium/manifest'
import { getManifestConfig } from './manifest-config'
import { getSetting, setSetting, deleteSetting, hasSetting } from './settings'
import { buildSchema, type ExtensionsDelta, type JsonSchemaProperty } from '@tabularium/manifest'

const SETTING_KEY = 'manifest.extensions_schema'
const PROP_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/
const MAX_PROPS = 64
const MAX_DEPTH = 8
const MAX_DESCRIPTION_LEN = 2000
const MAX_TITLE_LEN = 200
const MAX_PATTERN_LEN = 500

export type { ExtensionsDelta, JsonSchemaProperty }

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
  if (isPlainObject(node.items)) safetyCheck(node.items, depth + 1, `${path}.items`)
  if (isPlainObject(node.properties)) {
    const entries = Object.entries(node.properties)
    if (entries.length > MAX_PROPS) throw new Error(`${path}.properties: more than ${MAX_PROPS} keys`)
    for (const [name, sub] of entries) {
      safetyCheck(sub, depth + 1, `${path}.properties.${name}`)
    }
  }
}

function unwrapRootSchema(input: Record<string, unknown>): Record<string, unknown> {
  const hasProperties = isPlainObject(input.properties)
  const looksLikeRoot =
    hasProperties && (
      '$schema' in input ||
      '$id' in input ||
      input.type === 'object' ||
      'title' in input ||
      'additionalProperties' in input
    )
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

export function getExtensionsDelta(): ExtensionsDelta {
  const raw = getSetting(SETTING_KEY)
  if (!raw) return {}
  try {
    return validateExtensionsDelta(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

export async function setExtensionsDelta(delta: ExtensionsDelta | null): Promise<void> {
  if (delta === null || Object.keys(delta).length === 0) {
    if (hasSetting(SETTING_KEY)) await deleteSetting(SETTING_KEY)
    return
  }
  await setSetting(SETTING_KEY, JSON.stringify(validateExtensionsDelta(delta)))
}

export function getEffectiveExtensions(kindKey?: string | null): ExtensionsDelta {
  if (kindKey) {
    const { getKind } = require('./kinds') as typeof import('./kinds')
    const kind = getKind(kindKey)
    if (kind && kind.extensionsSchema && Object.keys(kind.extensionsSchema).length > 0) {
      return kind.extensionsSchema
    }
  }
  return getExtensionsDelta()
}

function loadKindOverrides(): Record<string, ExtensionsDelta> {
  const { getKinds } = require('./kinds') as typeof import('./kinds')
  const out: Record<string, ExtensionsDelta> = {}
  for (const k of getKinds()) {
    if (k.extensionsSchema && Object.keys(k.extensionsSchema).length > 0) {
      out[k.key] = k.extensionsSchema
    }
  }
  return out
}

export function buildMergedSchema(options: { kind?: string | null } = {}): Record<string, unknown> {
  const cfg = getManifestConfig()
  return buildSchema({
    coreSchema: ManifestSchema as unknown as TSchema,
    extensions: getExtensionsDelta(),
    kindOverrides: loadKindOverrides(),
    kind: options.kind ?? null,
    schemaUrl: cfg.schemaUrl,
  })
}
