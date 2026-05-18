import { createHash } from 'node:crypto'
import { canonicalize } from '@tabularium/manifest'
import { db } from '$db'
import { getCurrentPublicJwk, signPayload } from '$lib/registry-key'
import { env } from '$lib/env'

export type IntegrityAsset = {
  name: string
  sha256: string
  size: number
  attestation_bundle: unknown
}

export type IntegrityResult = {
  jws: string
  assets: IntegrityAsset[]
}

export type BuildIntegrityInput = {
  slug: string
  version: string
}

// TODO(plugin-integrity follow-up): The signed payload spec requires
// `manifest_sha256` to be the sha256 of the canonical manifest JSON for the
// release. The registry does not currently persist the raw manifest per
// release — only normalized projections — so for the first cut we hash the
// canonical empty object. Consumers know the algorithm; the real value will
// be plumbed once releases capture their source manifest.
const PLACEHOLDER_MANIFEST_SHA256 = createHash('sha256').update(canonicalize({})).digest('hex')

function parseAttestationBundle(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    // Fall back to the raw string so we never drop ingested data silently.
    return raw
  }
}

/**
 * Build the signed integrity block for a `(plugin slug, release version)`
 * pair. Reads the release + its `release_assets` rows, assembles the spec
 * payload, signs it with the active registry key, and returns the compact
 * JWS plus the per-asset metadata callers expose on the release response.
 *
 * Returns `null` when the release is missing or has no `release_assets`
 * rows (legacy releases pre-backfill). The caller is responsible for
 * omitting or nulling the integrity field on its response in that case.
 */
export async function buildIntegrity(input: BuildIntegrityInput): Promise<IntegrityResult | null> {
  const release = await db.query.releases.findFirst({
    where: { pluginId: input.slug, version: input.version },
    with: { assetRows: true },
  })
  if (!release) return null
  const assetRows = release.assetRows ?? []
  if (assetRows.length === 0) return null

  const jwk = await getCurrentPublicJwk()
  const issuedAt = Math.floor(Date.now() / 1000)

  const signedAssets = assetRows.map((row) => ({
    name: row.name,
    sha256: row.sha256,
    size: row.size,
  }))

  const payload = {
    v: 1 as const,
    kid: jwk.kid,
    issued_at: issuedAt,
    registry: env.BASE_URL,
    plugin_slug: input.slug,
    release_version: input.version,
    manifest_sha256: PLACEHOLDER_MANIFEST_SHA256,
    assets: signedAssets,
  }

  const jws = await signPayload(payload)

  const assets: IntegrityAsset[] = assetRows.map((row) => ({
    name: row.name,
    sha256: row.sha256,
    size: row.size,
    attestation_bundle: parseAttestationBundle(row.attestationBundle ?? null),
  }))

  return { jws, assets }
}
