import { Elysia, t } from 'elysia'
import { ManifestSchema } from '$lib/manifest'

const EXAMPLE = `name: My Plugin
description: A short tagline shown on the catalog card.
category: databases
tags: [postgres, sql, analytics]
license: MIT
icon: ./assets/icon.svg
screenshots:
  - url: ./assets/screen-1.png
    caption: Live query view
  - url: ./assets/screen-2.png
    caption: Settings panel
documentation_url: https://docs.example.com/my-plugin
homepage: https://example.com/my-plugin
support:
  email: support@example.com
  issues_url: https://github.com/me/my-plugin/issues
min_runtime_version: '2.4.0'
readme: README.md
`

export default new Elysia()
  .get('/', () => ({
    description:
      'Plugin authors drop a `.tabularium` (YAML), `.tabularium.yaml`, `.tabularium.yml`, or `.tabularium.json` file in their repo root. ' +
      'The registry fetches it on submission and on every release webhook. Relative `icon`/`screenshots` paths are resolved against the repo at the matching ref.',
    paths: ['.tabularium', '.tabularium.yaml', '.tabularium.yml', '.tabularium.json'],
    schema: ManifestSchema,
    example: EXAMPLE,
  }), {
    detail: {
      tags: ['Plugins'],
      summary: 'Discoverable .tabularium manifest spec',
      description: 'Public reference for plugin authors. Returns the TypeBox JSON Schema + an example.',
      operationId: 'getManifestSpec',
    },
    response: {
      200: t.Object({
        description: t.String(),
        paths: t.Array(t.String()),
        schema: t.Any(),
        example: t.String(),
      }),
    },
  })
