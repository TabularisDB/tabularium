import { Type, type TSchema } from '@sinclair/typebox'
import { ManifestSchema } from './manifest-core'
import { getManifestConfig } from './manifest-config'
import { getSetting, setSetting, deleteSetting, hasSetting } from './settings'

const SETTING_KEY = 'manifest.extensions_schema'

const PROP_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/
const MAX_PROPS = 64
const MAX_DEPTH = 8
const MAX_DESCRIPTION_LEN = 2000
const MAX_TITLE_LEN = 200
const MAX_PATTERN_LEN = 500

export type JsonSchemaProperty = Record<string, unknown>
export type ExtensionsDelta = Record<string, JsonSchemaProperty>

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

/**
 * If the input looks like a full root JSON Schema document (has `properties`
 * AND at least one of the meta fields), unwrap it to the properties record so
 * pasting a complete schema doesn't fail validation.
 */
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

function primitiveType(rawType: unknown): string | null {
  if (typeof rawType === 'string') return rawType
  if (Array.isArray(rawType)) {
    const found = rawType.find((t) => typeof t === 'string' && t !== 'null')
    if (typeof found === 'string') return found
  }
  return null
}

function nodeToTypeBox(node: JsonSchemaProperty): TSchema {
  const opts: Record<string, unknown> = {}
  if (typeof node.description === 'string') opts.description = node.description
  if (typeof node.title === 'string') opts.title = node.title
  const t = primitiveType(node.type)
  switch (t) {
    case 'string': {
      const stringOpts: Record<string, unknown> = { ...opts }
      if (Array.isArray(node.enum)) stringOpts.enum = node.enum
      if (typeof node.pattern === 'string') stringOpts.pattern = node.pattern
      return Type.String(stringOpts)
    }
    case 'number':
      return Type.Number(opts)
    case 'integer':
      return Type.Integer(opts)
    case 'boolean':
      return Type.Boolean(opts)
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
    default:
      return Type.Any()
  }
}

function extensionsToTypeBox(delta: ExtensionsDelta): TSchema {
  const props: Record<string, TSchema> = {}
  for (const [name, node] of Object.entries(delta)) {
    props[name] = Type.Optional(nodeToTypeBox(node))
  }
  return Type.Object(props)
}

// Per-kind override REPLACES the global delta when defined — operator chose
// this explicitly over a merge.
export function getEffectiveExtensions(kindKey?: string | null): ExtensionsDelta {
  if (kindKey) {
    // require() breaks the kinds.ts → manifest-schema.ts cycle.
    const { getKind } = require('./kinds') as typeof import('./kinds')
    const kind = getKind(kindKey)
    if (kind && kind.extensionsSchema && Object.keys(kind.extensionsSchema).length > 0) {
      return kind.extensionsSchema
    }
  }
  return getExtensionsDelta()
}

export function buildMergedSchema(options: { kind?: string | null } = {}): Record<string, unknown> {
  const cfg = getManifestConfig()
  const core = ManifestSchema as { properties: Record<string, unknown>; required?: string[] }

  if (options.kind) {
    const ext = getEffectiveExtensions(options.kind)
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${cfg.schemaUrl}?kind=${encodeURIComponent(options.kind)}`,
      title: `Tabularium plugin manifest — ${options.kind}`,
      type: 'object',
      additionalProperties: false,
      properties: { ...core.properties, ...ext },
      ...(core.required ? { required: core.required } : {}),
    }
  }

  const globalExt = getExtensionsDelta()
  const { getKinds } = require('./kinds') as typeof import('./kinds')
  const kinds = getKinds().filter((k) => k.extensionsSchema && Object.keys(k.extensionsSchema).length > 0)

  // Top-level lists every possible field across global + all kinds; if we left
  // kind-specific fields out, additionalProperties:false would reject manifests
  // that use them. The per-kind `then` clauses enforce the real shape.
  const allExtensionKeys = new Set<string>(Object.keys(globalExt))
  for (const k of kinds) {
    for (const key of Object.keys(k.extensionsSchema ?? {})) allExtensionKeys.add(key)
  }
  const lenientExtensionProps: Record<string, unknown> = {}
  for (const key of allExtensionKeys) {
    lenientExtensionProps[key] = globalExt[key] ?? {}
  }

  const schema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: cfg.schemaUrl,
    title: 'Tabularium plugin manifest',
    type: 'object',
    additionalProperties: false,
    properties: { ...core.properties, ...lenientExtensionProps },
    ...(core.required ? { required: core.required } : {}),
  }

  if (kinds.length > 0) {
    schema.allOf = kinds.map((k) => ({
      if: { properties: { kind: { const: k.key } }, required: ['kind'] },
      then: {
        properties: { ...core.properties, ...(k.extensionsSchema ?? {}) },
        additionalProperties: false,
      },
    }))
  }

  return schema
}

export function buildValidatorSchema(options: { kind?: string | null } = {}): TSchema {
  const ext = getEffectiveExtensions(options.kind ?? null)
  if (Object.keys(ext).length === 0) return ManifestSchema as unknown as TSchema
  return Type.Composite([ManifestSchema as unknown as TSchema, extensionsToTypeBox(ext)])
}
