import type { TSchema } from '@sinclair/typebox'

export type JsonSchemaProperty = Record<string, unknown>
export type ExtensionsDelta = Record<string, JsonSchemaProperty>

export type BuildSchemaInput = {
  coreSchema: TSchema
  extensions?: ExtensionsDelta
  kindOverrides?: Record<string, ExtensionsDelta>
  kind?: string | null
  schemaUrl?: string
}

const DEFAULT_SCHEMA_URL = 'https://tabularium.local/manifest.schema.json'

/**
 * Per-property convention: an extension property can opt into being mandatory
 * by setting `required: true` on its schema (or omitted/false to stay
 * optional). The flag is NOT valid JSON Schema at the property level — we
 * strip it before emitting the merged schema and instead append the property
 * name to the schema-level `required` array.
 *
 * Example admin ExtensionsDelta input:
 *   { "tabularis_api": { "type": "string", "minLength": 1, "required": true } }
 *
 * → resulting merged schema has `required: [...coreRequired, "tabularis_api"]`
 *   and the property itself has the `required` key stripped.
 */
function splitRequiredFlag(props: Record<string, unknown>): {
  cleaned: Record<string, unknown>
  required: string[]
} {
  const cleaned: Record<string, unknown> = {}
  const required: string[] = []
  for (const [name, schema] of Object.entries(props)) {
    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
      const node = schema as Record<string, unknown>
      if (node.required === true) {
        const { required: _strip, ...rest } = node
        cleaned[name] = rest
        required.push(name)
        continue
      }
    }
    cleaned[name] = schema
  }
  return { cleaned, required }
}

function stripXTranslations(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripXTranslations)
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'x-translations') continue
      out[k] = stripXTranslations(v)
    }
    return out
  }
  return node
}

export function buildSchema(input: BuildSchemaInput): Record<string, unknown> {
  const coreProps = (input.coreSchema as unknown as { properties: Record<string, unknown> }).properties
  const coreRequired = (input.coreSchema as unknown as { required?: string[] }).required ?? []
  const schemaUrl = input.schemaUrl ?? DEFAULT_SCHEMA_URL
  const globalExt = input.extensions ?? {}
  const kindOverrides = input.kindOverrides ?? {}

  if (input.kind) {
    const ext = kindOverrides[input.kind] ?? globalExt
    const { cleaned: extProps, required: extRequired } = splitRequiredFlag(ext)
    const required = [...coreRequired, ...extRequired]
    return stripXTranslations({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${schemaUrl}?kind=${encodeURIComponent(input.kind)}`,
      title: `Tabularium plugin manifest — ${input.kind}`,
      type: 'object',
      additionalProperties: false,
      properties: { ...coreProps, ...extProps },
      ...(required.length > 0 ? { required } : {}),
    }) as Record<string, unknown>
  }

  const allExtensionKeys = new Set<string>(Object.keys(globalExt))
  for (const key of Object.keys(kindOverrides)) {
    for (const k of Object.keys(kindOverrides[key])) allExtensionKeys.add(k)
  }
  const { cleaned: cleanedGlobal, required: globalRequired } = splitRequiredFlag(globalExt)
  const lenientExtensionProps: Record<string, unknown> = {}
  for (const key of allExtensionKeys) {
    lenientExtensionProps[key] = cleanedGlobal[key] ?? {}
  }

  // Global-extension `required: true` flags are enforced for ALL manifests
  // since they're not kind-scoped. Kind-override required flags live inside
  // the per-kind allOf branch below.
  const topRequired = [...coreRequired, ...globalRequired]

  const schema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: schemaUrl,
    title: 'Tabularium plugin manifest',
    type: 'object',
    additionalProperties: false,
    properties: { ...coreProps, ...lenientExtensionProps },
    ...(topRequired.length > 0 ? { required: topRequired } : {}),
  }

  // Filter out empty deltas — matches the original buildMergedSchema's
  // `kinds.filter(k => k.extensionsSchema && Object.keys(...).length > 0)`
  // so a kind with an empty `{}` override doesn't produce a vacuous
  // `then` clause that tightens additionalProperties without adding fields.
  const overrideKinds = Object.keys(kindOverrides).filter((k) => Object.keys(kindOverrides[k]).length > 0)
  if (overrideKinds.length > 0) {
    schema.allOf = overrideKinds.map((kindKey) => {
      const { cleaned, required } = splitRequiredFlag(kindOverrides[kindKey])
      const thenClause: Record<string, unknown> = {
        properties: { ...coreProps, ...cleaned },
        additionalProperties: false,
      }
      if (required.length > 0) thenClause.required = [...coreRequired, ...required]
      return {
        if: { properties: { kind: { const: kindKey } }, required: ['kind'] },
        then: thenClause,
      }
    })
  }

  return stripXTranslations(schema) as Record<string, unknown>
}
