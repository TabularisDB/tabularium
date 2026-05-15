import { Elysia, t } from 'elysia'
import { db } from '$db'
import { parseAssets } from '$lib/asset'

const assetEntrySchema = t.Object({
  url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
})

export default new Elysia()
  .get('/', async ({ params, set }) => {
    const plugin = await db.query.plugins.findFirst({ where: { id: params.slug } })
    if (!plugin || plugin.status !== 'approved') {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    const release = await db.query.releases.findFirst({
      where: { pluginId: plugin.id, version: params.version },
    })
    if (!release) {
      set.status = 404
      return { error: 'Release not found' }
    }
    return {
      slug: plugin.id,
      version: release.version,
      assets: parseAssets(release.assets),
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Asset integrity (sha256 + size) for a specific release',
      description:
        'Lookup endpoint for `sum.<host>`-style verifiers. Returns the per-platform URL alongside `sha256` and `size` when hashing has completed (fail-soft on webhook ingest — values may be absent if the upstream fetch failed).',
      operationId: 'getReleaseIntegrity',
    },
    params: t.Object({ slug: t.String(), version: t.String() }),
    response: {
      200: t.Object({
        slug: t.String(),
        version: t.String(),
        assets: t.Record(t.String(), assetEntrySchema),
      }),
      404: t.Object({ error: t.String() }),
    },
  })
