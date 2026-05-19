import { Elysia, t } from 'elysia'
import { db } from '$db'
import { parseAssets } from '$lib/asset'
import { buildIntegrity } from '$lib/release-integrity'

const assetEntrySchema = t.Object({
  url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
})

const signedAssetSchema = t.Object({
  name: t.String(),
  sha256: t.String(),
  size: t.Number(),
  attestation_bundle: t.Any(),
})

export default new Elysia().get(
  '/',
  async ({ params, set }) => {
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

    // Prefer the per-asset rows in `release_assets` over the legacy JSON blob.
    // When present, attach the signed JWS so verifiers can validate the
    // registry's claim.
    const signed = await buildIntegrity({ slug: plugin.id, version: release.version })
    if (signed) {
      return {
        slug: plugin.id,
        version: release.version,
        jws: signed.jws,
        assets: signed.assets,
      }
    }

    return {
      slug: plugin.id,
      version: release.version,
      assets: parseAssets(release.assets),
    }
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Asset integrity (sha256 + size) for a specific release',
      description:
        'Lookup endpoint for `sum.<host>`-style verifiers. When `release_assets` rows are present (post-ingest) the response includes the signed `jws` plus per-asset metadata (`name`, `sha256`, `size`, `attestation_bundle`). For legacy releases without per-asset rows yet, falls back to the platform-keyed JSON blob with `url`/`size`/`sha256`.',
      operationId: 'getReleaseIntegrity',
    },
    params: t.Object({ slug: t.String(), version: t.String() }),
    response: {
      200: t.Union([
        t.Object({
          slug: t.String(),
          version: t.String(),
          jws: t.String(),
          assets: t.Array(signedAssetSchema),
        }),
        t.Object({
          slug: t.String(),
          version: t.String(),
          assets: t.Record(t.String(), assetEntrySchema),
        }),
      ]),
      404: t.Object({ error: t.String() }),
    },
  },
)
