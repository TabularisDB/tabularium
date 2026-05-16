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

export function buildSchema(input: BuildSchemaInput): Record<string, unknown> {
  const coreProps = (input.coreSchema as unknown as { properties: Record<string, unknown> }).properties
  const coreRequired = (input.coreSchema as unknown as { required?: string[] }).required
  const schemaUrl = input.schemaUrl ?? DEFAULT_SCHEMA_URL
  const globalExt = input.extensions ?? {}
  const kindOverrides = input.kindOverrides ?? {}

  if (input.kind) {
    const ext = kindOverrides[input.kind] ?? globalExt
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${schemaUrl}?kind=${encodeURIComponent(input.kind)}`,
      title: `Tabularium plugin manifest — ${input.kind}`,
      type: 'object',
      additionalProperties: false,
      properties: { ...coreProps, ...ext },
      ...(coreRequired ? { required: coreRequired } : {}),
    }
  }

  const allExtensionKeys = new Set<string>(Object.keys(globalExt))
  for (const key of Object.keys(kindOverrides)) {
    for (const k of Object.keys(kindOverrides[key])) allExtensionKeys.add(k)
  }
  const lenientExtensionProps: Record<string, unknown> = {}
  for (const key of allExtensionKeys) {
    lenientExtensionProps[key] = globalExt[key] ?? {}
  }

  const schema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: schemaUrl,
    title: 'Tabularium plugin manifest',
    type: 'object',
    additionalProperties: false,
    properties: { ...coreProps, ...lenientExtensionProps },
    ...(coreRequired ? { required: coreRequired } : {}),
  }

  const overrideKinds = Object.keys(kindOverrides)
  if (overrideKinds.length > 0) {
    schema.allOf = overrideKinds.map((kindKey) => ({
      if: { properties: { kind: { const: kindKey } }, required: ['kind'] },
      then: {
        properties: { ...coreProps, ...kindOverrides[kindKey] },
        additionalProperties: false,
      },
    }))
  }

  return schema
}
