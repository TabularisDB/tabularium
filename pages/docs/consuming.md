# Consuming

For developers building software that downloads plugins from a Tabularium registry (a plugin manager, a deployment script, the Tabularis client). Covers how to verify a plugin end-to-end before trusting it.

## What the registry gives you

Two endpoints surface release integrity:

```
GET /api/plugins/:slug/releases/:version
GET /api/plugins/:slug/releases/latest
```

Both return the release record with an `integrity` field:

```json
{
  "slug": "my-plugin",
  "version": "1.4.0",
  "assets": [
    { "name": "my-plugin-linux-x64.zip", "url": "https://github.com/…", "size": 1234567 }
  ],
  "integrity": {
    "jws": "eyJhbGciOiJFZERTQSIsImtpZCI6Ij…",
    "assets": [
      {
        "name": "my-plugin-linux-x64.zip",
        "sha256": "abcdef…",
        "size": 1234567,
        "contentType": "application/zip",
        "arch": "x64",
        "os": "linux",
        "attestation": null
      }
    ]
  }
}
```

The signed payload (decoded from `integrity.jws`) contains the same `assets` list plus the manifest hash and identity fields. **The signed payload is the source of truth** — never trust the bare `assets` list without verifying.

Plus the JWKS:

```
GET /.well-known/registry-key.json
```

## Three trust layers

In order of importance:

1. **Asset hash** — the file you downloaded matches the `sha256` in the signed payload
2. **Registry signature** — the `integrity.jws` validates against a key in the registry's JWKS (proves the registry observed those hashes at ingest)
3. **Build-provenance attestation** — verify the sigstore bundle in `attestation` to bind the asset hash to the upstream CI workflow that built it (opt-in, only present when the upstream forge published one)

Layer 2 protects against an attacker swapping the asset on the upstream forge. Layer 3 protects against a compromised registry relaying a maliciously-rebuilt asset.

## End-to-end verification

Bun / TypeScript using `jose` for JWS + `@tabularium/manifest` for the hash helper:

```ts
import { compactVerify, importJWK, type JWK } from 'jose'
import { verifyAssetHash } from '@tabularium/manifest'

const REGISTRY = 'https://registry.example.com'

// In-memory JWKS cache. In production persist between sessions and
// add a periodic refresh — this just shows the kid-miss refresh path.
let jwksCache: { keys: JWK[] } | null = null
async function getKey(kid: string): Promise<JWK> {
  if (jwksCache) {
    const hit = jwksCache.keys.find((k) => k.kid === kid)
    if (hit) return hit
  }
  const res = await fetch(`${REGISTRY}/.well-known/registry-key.json`)
  jwksCache = (await res.json()) as { keys: JWK[] }
  const hit = jwksCache.keys.find((k) => k.kid === kid)
  if (!hit) throw new Error(`No registry key for kid ${kid}`)
  return hit
}

async function verifyAndDownload(slug: string, version: string, assetName: string) {
  // 1. Fetch the release
  const release = await (await fetch(`${REGISTRY}/api/plugins/${slug}/releases/${version}`)).json()
  if (!release.integrity?.jws) throw new Error(`No signed integrity for ${slug}@${version}`)

  // 2. Verify signature (layer 2)
  const header = JSON.parse(
    Buffer.from(release.integrity.jws.split('.')[0], 'base64url').toString(),
  )
  const jwk = await getKey(header.kid)
  const { payload } = await compactVerify(release.integrity.jws, await importJWK(jwk))
  const signed = JSON.parse(new TextDecoder().decode(payload))

  if (signed.slug !== slug || signed.version !== version) {
    throw new Error('Signed payload identity mismatch')
  }

  // 3. Find the asset in the signed list
  const signedAsset = signed.assets.find((a: { name: string }) => a.name === assetName)
  if (!signedAsset) throw new Error(`Asset ${assetName} not in signed integrity`)
  const downloadUrl = release.assets.find((a: { name: string }) => a.name === assetName)?.url
  if (!downloadUrl) throw new Error(`Missing download URL`)

  // 4. Download + verify hash (layer 1)
  const assetRes = await fetch(downloadUrl)
  if (!assetRes.body) throw new Error('No body')
  const ok = await verifyAssetHash(assetRes.body, signedAsset.sha256)
  if (!ok) throw new Error(`Hash mismatch for ${assetName} — asset tampered or corrupted`)

  // 5. (Optional) verify sigstore attestation bundle (layer 3)
  if (signedAsset.attestation) {
    // Use a sigstore client. The bundle is standard sigstore Bundle format.
    // await verifyAttestationBundle(signedAsset.attestation, signedAsset.sha256)
  }

  return { signedAsset, downloadUrl }
}

await verifyAndDownload('my-plugin', '1.4.0', 'my-plugin-linux-x64.zip')
```

`@tabularium/manifest` also exports `verifyRegistrySignature` (Web Crypto Ed25519, no external deps) if you'd rather not pull in `jose`.

## JWKS handling

```json
{
  "keys": [
    { "kid": "current-kid",  "kty": "OKP", "crv": "Ed25519", "x": "…", "alg": "EdDSA", "use": "sig" },
    { "kid": "previous-kid", "kty": "OKP", "crv": "Ed25519", "x": "…", "alg": "EdDSA", "use": "sig" }
  ]
}
```

Cache aggressively, refresh on a `kid` miss. The cache pattern in the example above is the minimum viable: keep the JWKS in memory; on an unknown `kid`, fetch once and retry. For long-running clients add a TTL (e.g. 24h) to pick up new previous-slot keys after rotations.

**Never trust a key you fetched without checking it.** If you bootstrap trust over plain HTTPS you're trusting whoever has a valid TLS certificate for the registry. For higher assurance, distribute the registry's public key out of band (config file shipped with your client) and pin it.

## Failure modes

| Symptom | Meaning | Action |
|---|---|---|
| `integrity` field missing | Legacy release, pre-Phase 2. | Treat as untrusted; ask the operator to run [backfill](admin/security.md#integrity-backfill). |
| `integrity.jws` present, signed payload missing the asset | Asset was over the hash budget at ingest. | Treat as untrusted; ask the operator to raise the budget + re-backfill. |
| Hash mismatch on download | Asset tampered upstream, or corrupted in transit. | Don't install; retry once; if persistent, alert upstream + registry. |
| Signature verification fails | Wrong kid, cached JWKS too long, or registry compromise. | Refresh JWKS once; if still failing, alert your security team. |
| `kid` not in JWKS even after refresh | Registry rotated twice since signing; oldest key was displaced. | Release predates both current keys — treat as unverifiable or ask the registry to re-sign. |

## FAQ

**Why not just trust HTTPS to the registry?** HTTPS protects bytes in transit. The signature protects provenance — even if someone proxies the registry, a CDN cache is poisoned, or you're consuming a mirror, the JWS still tells you who computed the hashes and when. Defense-in-depth.

**Do I have to verify all three layers?** Layer 1 (hash) and layer 2 (signature) are the floor. Skip either and you trust the network or the registry to never lie. Layer 3 (attestation) is opt-in per release — verify it where present, don't require it.

**What's `manifest_sha256` in the signed payload?** A hash of the canonical manifest JSON the registry indexed. Today it's a placeholder (canonical-empty-object hash) because the raw manifest text isn't yet preserved through ingest. Once wired up, you can verify that the manifest you read from the API matches what the registry actually signed.

**Can I verify offline?** Once you've cached the JWKS, yes. The verification math is pure — JWS verify, SHA-256, hash compare. No further network access beyond the asset download.
