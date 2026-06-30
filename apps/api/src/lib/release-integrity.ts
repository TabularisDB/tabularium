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
  // Canonical raw .tabularium served by the registry. Clients verify
  // sha256(manifest_raw) === the JWS-signed manifest_sha256, so they never
  // need to fetch the manifest from the forge. Null on legacy releases
  // ingested before raw storage existed.
  manifest_raw: string | null
}

export type BuildIntegrityInput = {
  slug: string
  version: string
}

function parseAttestationBundle(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// Returns null for releases that predate per-asset hashing (no release_assets
// rows) or that haven't had their manifest hashed yet (manifest fetch races
// the webhook response). Callers omit the integrity field in that case.
export async function buildIntegrity(input: BuildIntegrityInput): Promise<IntegrityResult | null> {
  const release = await db.query.releases.findFirst({
    where: { pluginId: input.slug, version: input.version },
    with: { assetRows: true },
  })
  if (!release) return null
  const assetRows = release.assetRows ?? []
  if (assetRows.length === 0) return null
  if (!release.manifestSha256) return null

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
    manifest_sha256: release.manifestSha256,
    assets: signedAssets,
  }

  const jws = await signPayload(payload)

  const assets: IntegrityAsset[] = assetRows.map((row) => ({
    name: row.name,
    sha256: row.sha256,
    size: row.size,
    attestation_bundle: parseAttestationBundle(row.attestationBundle ?? null),
  }))

  return { jws, assets, manifest_raw: release.manifestRaw ?? null }
}
