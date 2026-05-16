import { Type, type TSchema } from '@sinclair/typebox'
import { ManifestSchema } from './manifest-core'
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

// Server-side TypeBox composite for parseManifestText. Kept because the existing
// resolve/manifest path uses Value.Clean + Value.Errors; switching it over to the
// ajv path happens in a separate task (this one preserves behaviour).
function nodeToTypeBox(node: JsonSchemaProperty): TSchema {
  const opts: Record<string, unknown> = {}
  if (typeof node.description === 'string') opts.description = node.description
  if (typeof node.title === 'string') opts.title = node.title
  const t = Array.isArray(node.type)
    ? (node.type.find((x) => typeof x === 'string' && x !== 'null') as string | undefined)
    : (typeof node.type === 'string' ? node.type : undefined)
  switch (t) {
    case 'string': {
      const stringOpts: Record<string, unknown> = { ...opts }
      if (Array.isArray(node.enum)) stringOpts.enum = node.enum
      if (typeof node.pattern === 'string') stringOpts.pattern = node.pattern
      return Type.String(stringOpts)
    }
    case 'number': return Type.Number(opts)
    case 'integer': return Type.Integer(opts)
    case 'boolean': return Type.Boolean(opts)
    case 'array': {
      const items = isPlainObject(node.items) ? (node.items as JsonSchemaProperty) : null
      const item = items ? nodeToTypeBox(items) : Type.Any()
      return Type.Array(item, opts)
    }
    case 'object': {
      const props: Record<string, TSchema> = {}
      const required = new Set<string>(
        Array.isArray(node.required) ? (node.required as string[]) : [],
      )
      const properties = isPlainObject(node.properties)
        ? (node.properties as Record<string, JsonSchemaProperty>)
        : {}
      for (const [name, sub] of Object.entries(properties)) {
        if (!isPlainObject(sub)) continue
        const schema = nodeToTypeBox(sub as JsonSchemaProperty)
        props[name] = required.has(name) ? schema : Type.Optional(schema)
      }
      return Type.Object(props, opts)
    }
    default: return Type.Any()
  }
}

function extensionsToTypeBox(delta: ExtensionsDelta): TSchema {
  const props: Record<string, TSchema> = {}
  for (const [name, node] of Object.entries(delta)) {
    props[name] = Type.Optional(nodeToTypeBox(node))
  }
  return Type.Object(props)
}

export function buildValidatorSchema(options: { kind?: string | null } = {}): TSchema {
  const ext = getEffectiveExtensions(options.kind ?? null)
  if (Object.keys(ext).length === 0) return ManifestSchema as unknown as TSchema
  return Type.Composite([ManifestSchema as unknown as TSchema, extensionsToTypeBox(ext)])
}
