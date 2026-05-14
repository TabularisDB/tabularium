import { Elysia, t } from 'elysia'
import { ManifestSchema } from '$lib/manifest'
import { getManifestConfig } from '$lib/manifest-config'
import { getKinds } from '$lib/kinds'

const EXAMPLE = `name: My Plugin
description: A short tagline shown on the catalog card.
category: databases
kind: theme
tags: [dark, minimal]
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

function buildDescription(filename: string): string {
  return (
    `Plugin authors drop a \`.${filename}\` (YAML), \`.${filename}.yaml\`, \`.${filename}.yml\`, or \`.${filename}.json\` file in their repo root. ` +
    'The registry fetches it on submission and on every release webhook. Relative `icon`/`screenshots` paths are resolved against the repo at the matching ref. ' +
    'Set `kind` to one of the values in `kinds` (the registry\'s active kind catalog) to surface your plugin in kind-filtered views. ' +
    'The kind value is also folded into `tags` internally so generic tag filters keep working.'
  )
}

export default new Elysia()
  .get('/', () => {
    const cfg = getManifestConfig()
    return {
      description: buildDescription(cfg.filename),
      paths: cfg.paths,
      schema: { $id: cfg.schemaUrl, ...ManifestSchema },
      example: EXAMPLE,
      kinds: getKinds().map((k) => k.key),
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Discoverable plugin manifest spec',
      description: 'Public reference for plugin authors. Returns the TypeBox JSON Schema, an example, and the registry\'s active kind keys.',
      operationId: 'getManifestSpec',
    },
    response: {
      200: t.Object({
        description: t.String(),
        paths: t.Array(t.String()),
        schema: t.Any(),
        example: t.String(),
        kinds: t.Array(t.String()),
      }),
    },
  })
