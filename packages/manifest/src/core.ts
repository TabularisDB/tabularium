import { Type, type Static } from '@sinclair/typebox'

// Strict semver pattern for the JSON Schema `pattern` keyword.
// Used in the browser/CLI where pulling the `semver` package would be heavy.
// On the server, prefer `semver.valid()` (see apps/api/src/lib/semver.ts).
export const SEMVER_VERSION_PATTERN = '^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$'

// Locked core. Operator-editable fields live in `manifest.extensions_schema`,
// not here.
export const ManifestSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    maxLength: 64,
    pattern: '^[a-z][a-z0-9-]*$',
    description:
      'URL slug, canonical package name, and default display title. Must start with a letter; lowercase alphanumerics + hyphens only. REQUIRED — pinned at first submit; changing it later does not rename the existing slug. Use the README for prose / branding; no separate display-name field.',
  }),
  version: Type.String({
    minLength: 1,
    maxLength: 40,
    pattern: SEMVER_VERSION_PATTERN,
    description:
      'Semantic version of this plugin release (no leading "v"). REQUIRED — must match the release tag stripped of any "v" prefix. The registry rejects ingests whose tag and manifest version disagree, so a manifest version bump is the single source of truth for "this is a new release".',
  }),
  description: Type.Optional(
    Type.String({
      maxLength: 280,
      description:
        'One-line summary shown on the plugin card and search results. Keep it under 280 characters and write it like a tagline, not a paragraph.',
    }),
  ),
  category: Type.Optional(
    Type.String({
      maxLength: 40,
      description: 'Free-form category label. Used for grouping plugins on the registry home page.',
    }),
  ),
  kind: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 40,
      pattern: '^[a-z0-9][a-z0-9-]*$',
      description:
        "Plugin kind slug (must match one of the registry's configured kinds — see the per-kind sections below). Drives which extension fields apply and whether your plugin appears on the catalogue page for that kind.",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String({ maxLength: 30 }), {
      maxItems: 16,
      description: "Searchable tags. Used by the registry's search index; max 16 tags, 30 chars each.",
    }),
  ),
  license: Type.Optional(
    Type.String({
      maxLength: 40,
      description:
        'SPDX identifier (e.g. "MIT", "Apache-2.0", "GPL-3.0-only"). Plain text accepted; SPDX is strongly recommended.',
    }),
  ),
  icon: Type.Optional(
    Type.String({
      maxLength: 500,
      description:
        'URL to the plugin icon. Renders next to the plugin name on cards and detail pages. PNG/SVG recommended, 256×256 or vector.',
    }),
  ),
  screenshots: Type.Optional(
    Type.Array(
      Type.Object({
        url: Type.String({ minLength: 1, maxLength: 500, description: 'Image URL.' }),
        caption: Type.Optional(
          Type.String({ maxLength: 200, description: 'Optional caption shown under the screenshot.' }),
        ),
        alt: Type.Optional(Type.String({ maxLength: 200, description: 'Accessible alt text for screen readers.' })),
      }),
      {
        maxItems: 12,
        description: 'Up to 12 screenshots shown in the plugin detail gallery.',
      },
    ),
  ),
  readme: Type.Optional(
    Type.String({
      maxLength: 500,
      description: 'Repo-relative path or URL to the README markdown file. Rendered on the plugin detail page.',
    }),
  ),
  readmes: Type.Optional(
    Type.Record(Type.String({ pattern: '^[a-z]{2}(-[A-Z]{2})?$', maxLength: 10 }), Type.String({ maxLength: 500 }), {
      description:
        'Per-locale README overrides. Map keys are BCP-47 locale codes (e.g. "en", "de", "zh-CN"); values are the same shape as `readme`.',
    }),
  ),
  documentation_url: Type.Optional(
    Type.String({
      pattern: '^https?://.+',
      description:
        'Link to standalone documentation site (Vitepress, MkDocs, GitHub Pages, etc.). Surfaces as an "Open docs" CTA.',
    }),
  ),
  homepage: Type.Optional(
    Type.String({
      pattern: '^https?://.+',
      description: 'Marketing homepage if separate from the documentation site or the repository.',
    }),
  ),
  support: Type.Optional(
    Type.Object(
      {
        email: Type.Optional(Type.String({ maxLength: 254, description: 'Contact email for end users.' })),
        issues_url: Type.Optional(Type.String({ pattern: '^https?://.+', description: 'Issue tracker URL.' })),
      },
      { description: 'Where end users go when they have a problem with the plugin.' },
    ),
  ),
  min_runtime_version: Type.Optional(
    Type.String({
      maxLength: 40,
      description:
        'Minimum host runtime version (semver range or single version). The host refuses to load the plugin on older runtimes.',
    }),
  ),
  requires: Type.Optional(
    Type.Array(
      Type.Object(
        {
          id: Type.String({
            minLength: 1,
            maxLength: 64,
            pattern: '^[a-z][a-z0-9-]*$',
            description:
              'Slug of another registry plugin this one depends on. Must match an installable plugin on the same registry.',
          }),
          version: Type.Optional(
            Type.String({
              maxLength: 40,
              description:
                'Optional semver range (e.g. ">=1.2.0", "^2.0.0"). When omitted, any version of the required plugin is acceptable.',
            }),
          ),
          optional: Type.Optional(
            Type.Boolean({
              description:
                'When true, the host should warn but not block install if the required plugin is missing. Defaults to false (hard dependency).',
            }),
          ),
          reason: Type.Optional(
            Type.String({
              maxLength: 200,
              description:
                'Human-readable explanation shown next to the dependency in the install UI ("needed for X feature").',
            }),
          ),
        },
        { description: 'A single dependency on another registry plugin.' },
      ),
      {
        maxItems: 32,
        description:
          'Other registry plugins this plugin needs to function. Hosts (Tabularis and others) surface this during install: the consumer sees the list, can review them, and the host auto-resolves the install order. Self-references and cycles are rejected by the registry at submit time.',
      },
    ),
  ),
})

export type Manifest = Static<typeof ManifestSchema>

export type ReadmeMap = Record<string, string>

export type ResolvedManifest = {
  raw: string
  parsed: Manifest
  readmeMarkdown: string | null
  readmeLocales: ReadmeMap | null
}
