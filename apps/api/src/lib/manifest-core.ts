import { Type, type Static } from '@sinclair/typebox'

// Locked core. Operator-editable fields live in `manifest.extensions_schema`,
// not here.
export const ManifestSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  description: Type.Optional(Type.String({ maxLength: 280 })),
  category: Type.Optional(Type.String({ maxLength: 40 })),
  kind: Type.Optional(Type.String({ minLength: 1, maxLength: 40, pattern: '^[a-z0-9][a-z0-9-]*$' })),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 30 }), { maxItems: 16 })),
  license: Type.Optional(Type.String({ maxLength: 40 })),
  icon: Type.Optional(Type.String({ maxLength: 500 })),
  screenshots: Type.Optional(Type.Array(Type.Object({
    url: Type.String({ minLength: 1, maxLength: 500 }),
    caption: Type.Optional(Type.String({ maxLength: 200 })),
    alt: Type.Optional(Type.String({ maxLength: 200 })),
  }), { maxItems: 12 })),
  readme: Type.Optional(Type.String({ maxLength: 500 })),
  documentation_url: Type.Optional(Type.String({ pattern: '^https?://.+' })),
  homepage: Type.Optional(Type.String({ pattern: '^https?://.+' })),
  support: Type.Optional(Type.Object({
    email: Type.Optional(Type.String({ maxLength: 254 })),
    issues_url: Type.Optional(Type.String({ pattern: '^https?://.+' })),
  })),
  min_runtime_version: Type.Optional(Type.String({ maxLength: 40 })),
})

export type Manifest = Static<typeof ManifestSchema>

export type ResolvedManifest = {
  raw: string
  parsed: Manifest
  readmeMarkdown: string | null
  source: 'tabularium.yaml' | 'tabularium.json'
}
