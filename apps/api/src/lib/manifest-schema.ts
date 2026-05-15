import { ManifestSchema } from './manifest-core'
import { getManifestConfig } from './manifest-config'
import { getSetting, setSetting, deleteSetting, hasSetting } from './settings'

const SETTING_KEY = 'manifest.extensions_schema'

const ALLOWED_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
])

const PROP_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/
const MAX_PROPS = 32
const MAX_DEPTH = 6
const MAX_STRING_LEN = 200

export type JsonSchemaProperty = Record<string, unknown>
export type ExtensionsDelta = Record<string, JsonSchemaProperty>

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateNode(node: unknown, depth: number, path: string): void {
  if (depth > MAX_DEPTH) throw new Error(`${path}: nesting exceeds max depth of ${MAX_DEPTH}`)
  if (!isPlainObject(node)) throw new Error(`${path}: must be an object`)
  if (typeof node.type !== 'string' || !ALLOWED_TYPES.has(node.type)) {
    throw new Error(`${path}: type must be one of ${[...ALLOWED_TYPES].join(', ')}`)
  }
  if ('$ref' in node) throw new Error(`${path}: $ref is not allowed`)
  if ('default' in node && node.default !== null && typeof node.default !== node.type && !(node.type === 'integer' && typeof node.default === 'number')) {
    throw new Error(`${path}.default: must match the declared type`)
  }
  if (typeof node.description === 'string' && node.description.length > MAX_STRING_LEN) {
    throw new Error(`${path}.description: exceeds ${MAX_STRING_LEN} chars`)
  }
  if (typeof node.title === 'string' && node.title.length > MAX_STRING_LEN) {
    throw new Error(`${path}.title: exceeds ${MAX_STRING_LEN} chars`)
  }
  if (node.type === 'string') {
    if ('enum' in node) {
      if (!Array.isArray(node.enum)) throw new Error(`${path}.enum: must be an array`)
      for (const e of node.enum) {
        if (typeof e !== 'string') throw new Error(`${path}.enum: entries must be strings`)
      }
    }
    if (typeof node.pattern === 'string' && node.pattern.length > MAX_STRING_LEN) {
      throw new Error(`${path}.pattern: exceeds ${MAX_STRING_LEN} chars`)
    }
  }
  if (node.type === 'array') {
    if (!isPlainObject(node.items)) throw new Error(`${path}.items: required for arrays`)
    validateNode(node.items, depth + 1, `${path}.items`)
  }
  if (node.type === 'object') {
    if ('properties' in node) {
      if (!isPlainObject(node.properties)) throw new Error(`${path}.properties: must be an object`)
      const entries = Object.entries(node.properties)
      if (entries.length > MAX_PROPS) throw new Error(`${path}.properties: more than ${MAX_PROPS} keys`)
      for (const [name, sub] of entries) {
        if (!PROP_NAME_RE.test(name) || name.length > 60) {
          throw new Error(`${path}.properties.${name}: invalid property name`)
        }
        validateNode(sub, depth + 1, `${path}.properties.${name}`)
      }
    }
    if ('required' in node) {
      if (!Array.isArray(node.required)) throw new Error(`${path}.required: must be an array`)
      for (const r of node.required) {
        if (typeof r !== 'string') throw new Error(`${path}.required: entries must be strings`)
      }
    }
  }
}

/**
 * Validates an extensions delta: a flat record of { propertyName -> JSON Schema node }.
 * The registry wraps this into a proper object schema at merge time; the admin only
 * ever defines the extra properties they want to add on top of the locked core.
 */
export function validateExtensionsDelta(input: unknown): ExtensionsDelta {
  if (input === null || input === undefined) return {}
  if (!isPlainObject(input)) throw new Error('extensions must be an object')
  const entries = Object.entries(input)
  if (entries.length > MAX_PROPS) throw new Error(`extensions: more than ${MAX_PROPS} top-level properties`)
  const coreKeys = new Set(Object.keys((ManifestSchema as { properties: Record<string, unknown> }).properties))
  const out: ExtensionsDelta = {}
  for (const [name, node] of entries) {
    if (!PROP_NAME_RE.test(name) || name.length > 60) {
      throw new Error(`extensions.${name}: invalid property name`)
    }
    if (coreKeys.has(name)) {
      throw new Error(`extensions.${name}: shadows a core manifest field`)
    }
    if (!isPlainObject(node)) throw new Error(`extensions.${name}: must be a JSON Schema object`)
    validateNode(node, 1, `extensions.${name}`)
    out[name] = node as JsonSchemaProperty
  }
  return out
}

export function getExtensionsDelta(): ExtensionsDelta {
  const raw = getSetting(SETTING_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return validateExtensionsDelta(parsed)
  } catch {
    return {}
  }
}

export async function setExtensionsDelta(delta: ExtensionsDelta | null): Promise<void> {
  if (delta === null || Object.keys(delta).length === 0) {
    if (hasSetting(SETTING_KEY)) await deleteSetting(SETTING_KEY)
    return
  }
  const cleaned = validateExtensionsDelta(delta)
  await setSetting(SETTING_KEY, JSON.stringify(cleaned))
}

/**
 * Builds the JSON Schema served at the public schema URL: the locked core ∪
 * the admin-defined extensions. Returns a JSON Schema 2020-12 compatible object.
 */
export function buildMergedSchema(): Record<string, unknown> {
  const cfg = getManifestConfig()
  const core = ManifestSchema as { properties: Record<string, unknown>; required?: string[] }
  const extensions = getExtensionsDelta()
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: cfg.schemaUrl,
    title: 'Tabularium plugin manifest',
    type: 'object',
    additionalProperties: false,
    properties: { ...core.properties, ...extensions },
    ...(core.required ? { required: core.required } : {}),
  }
}
