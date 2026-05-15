import { Type, type TSchema } from '@sinclair/typebox'
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
 * Translate a JSON Schema node from the admin delta into a TypeBox TSchema so
 * Value.Errors/Clean can validate against it. The delta is already constrained
 * by validateExtensionsDelta so the input shape is small.
 */
function nodeToTypeBox(node: JsonSchemaProperty): TSchema {
  const opts: Record<string, unknown> = {}
  if (typeof node.description === 'string') opts.description = node.description
  if (typeof node.title === 'string') opts.title = node.title
  switch (node.type) {
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
      const items = node.items as JsonSchemaProperty
      return Type.Array(nodeToTypeBox(items), opts)
    }
    case 'object': {
      const props: Record<string, TSchema> = {}
      const required = new Set<string>(
        Array.isArray(node.required) ? (node.required as string[]) : [],
      )
      const properties = (node.properties as Record<string, JsonSchemaProperty> | undefined) ?? {}
      for (const [name, sub] of Object.entries(properties)) {
        const schema = nodeToTypeBox(sub)
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
    // Extension fields are optional at top level — operator can require nested fields
    // but not the top-level extension key itself.
    props[name] = Type.Optional(nodeToTypeBox(node))
  }
  return Type.Object(props)
}

/**
 * Picks the effective extensions for the given kind. Per-kind override REPLACES
 * the global delta when defined (operator chose "overwrite" semantics); plugins
 * of that kind do not inherit global extensions.
 */
export function getEffectiveExtensions(kindKey?: string | null): ExtensionsDelta {
  if (kindKey) {
    // Lazy import to avoid the kinds.ts → manifest-schema.ts cycle.
    const { getKind } = require('./kinds') as typeof import('./kinds')
    const kind = getKind(kindKey)
    if (kind && kind.extensionsSchema && Object.keys(kind.extensionsSchema).length > 0) {
      return kind.extensionsSchema
    }
  }
  return getExtensionsDelta()
}

/**
 * Builds the JSON Schema served at the public schema URL: the locked core ∪
 * the applicable extensions for the given kind (or global if no kind).
 *
 * When called without a kind we emit a single schema where each registered
 * kind's properties are folded in via an `allOf` of `if/then` clauses on the
 * `kind` field — so a single URL gives IDEs full autocomplete for every kind.
 */
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

  // Top-level lists every possible field across global + all kinds so a manifest
  // that uses kind-specific extensions still passes the additionalProperties: false
  // check. The per-kind `then` clauses then enforce the actual shape for that kind.
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

/**
 * Builds a TypeBox schema for server-side validation. Unlike buildMergedSchema
 * (which serves IDE-friendly JSON Schema), this returns a TSchema with the
 * Kind brands TypeBox's Value.Errors/Clean require.
 *
 * Extensions are translated from the admin delta into TypeBox primitives at
 * call time. Per-kind override REPLACES the global delta when defined.
 */
export function buildValidatorSchema(options: { kind?: string | null } = {}): TSchema {
  const ext = getEffectiveExtensions(options.kind ?? null)
  if (Object.keys(ext).length === 0) return ManifestSchema as unknown as TSchema
  // Composite intersects the core (already a TypeBox schema) with the
  // translated extensions, keeping optional/required semantics on both sides.
  return Type.Composite([ManifestSchema as unknown as TSchema, extensionsToTypeBox(ext)])
}
