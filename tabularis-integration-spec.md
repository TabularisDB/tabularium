# Tabularis ↔ Tabularium — integration spec (for the client-side agent)

Goal: let Tabularis browse plugins from a Tabularium registry and **install
them with automatic integrity verification**. The registry never hosts the
binaries — it hosts *signed hashes* of the forge (GitHub) release assets. The
client downloads the asset from the forge and proves it matches what the plugin
author published.

Base URL of the public instance: `https://registry.tabularis.dev`
(self-hosters set their own; read it back from the signed payload's `registry`
field, never hardcode).

---

## 1. The `.tabularium` manifest

Each plugin is a repo with a `.tabularium` file (JSON/YAML). At every GitHub
release the author **attaches `.tabularium` as a release asset**; the registry
ingests it, validates it, hashes every other release asset, and stores the raw
manifest bytes verbatim. Relevant fields:

| field | req | meaning |
|-------|-----|---------|
| `name` | ✓ | slug — `^[a-z][a-z0-9-]*$`, ≤64 |
| `version` | ✓ | semver, **no** `v` prefix; must equal the release tag stripped of `v` |
| `kind` | — | plugin kind (drives which extension fields apply) |
| `description`,`category`,`tags`,`license`,`icon` | — | catalogue metadata |
| `readmes:` | — | per-locale README paths |
| `assets` | — | per-platform download entries (`universal` or `os/arch` keyed) |

The client does **not** parse `.tabularium` off the forge itself — it gets the
canonical bytes (`manifest_raw`) from the registry, already hash-pinned by the
signature (see §3).

---

## 2. Endpoints the client calls

| method | path | returns |
|--------|------|---------|
| GET | `/.well-known/registry-key.json` | JWKS `{ keys: [current, previous?] }` — Ed25519 public keys, `application/jwk-set+json`, cache 300s |
| GET | `/api/plugins` | catalogue (browse/search) |
| GET | `/api/plugins/{slug}` | plugin detail |
| GET | `/api/plugins/{slug}/latest?os=&arch=` | resolves the asset for a platform → `{ download_url, sha256, platforms{…} }`. `?redirect=1` → 302 to `download_url`. UA-sniffed if os/arch omitted; falls back to `universal`. |
| GET | `/api/plugins/{slug}/releases/{version}/integrity` | **the signed integrity doc** — see §3 |

---

## 3. The integrity document (the important one)

`GET /api/plugins/{slug}/releases/{version}/integrity` →

```jsonc
{
  "slug": "my-plugin",
  "version": "1.2.0",
  "jws": "<compact JWS, EdDSA>",          // present on post-ingest releases
  "assets": [
    { "name": "driver-linux-x64.tar.gz", "sha256": "…", "size": 12345,
      "attestation_bundle": { /* sigstore provenance, or null */ } }
  ],
  "manifest_raw": "<verbatim .tabularium bytes, or null on legacy releases>"
}
```

The **`jws`** is a JWS Compact Serialization (jose `CompactSign`), protected
header `{ "alg": "EdDSA", "kid": "<key id>" }`. Its payload is the
**canonicalized** (JCS) JSON of:

```jsonc
{
  "v": 1,
  "kid": "<key id>",
  "issued_at": 1730000000,
  "registry": "https://registry.tabularis.dev",
  "plugin_slug": "my-plugin",
  "release_version": "1.2.0",
  "manifest_sha256": "<sha256 hex of manifest_raw>",
  "assets": [ { "name": "…", "sha256": "…", "size": 12345 } ]
}
```

Everything the client trusts must come from **inside the verified JWS payload**,
not from the surrounding (unsigned) JSON envelope. The top-level `assets`/
`manifest_raw` are conveniences; the signed copies are authoritative.

---

## 4. Verification flow (what the client agent implements)

```
1. Fetch JWKS  → keys[]  (match by `kid`; keep `previous` so rotation doesn't break installs)
2. GET integrity for {slug, version}
3. Verify jws with the JWKS key whose kid matches the protected header
      → yields the canonical payload bytes → parse to `payload`
   (jose: `compactVerify(jws, key)`; or use verifyRegistrySignature() from @tabularium/manifest
    with the payload bytes + raw signature + public JWK)
4. Guard the payload:
      payload.plugin_slug     === slug
      payload.release_version === version
      payload.registry        === the registry you fetched from
      (reject on any mismatch — a valid signature over the WRONG release is still an attack)
5. Manifest pin (if manifest_raw != null):
      sha256(manifest_raw) === payload.manifest_sha256   → then parse manifest from manifest_raw
6. For each asset to install:
      a. resolve download_url via /latest (or the release asset list), match by asset `name`
      b. look up expected sha256 = payload.assets[name].sha256   ← SIGNED value only
      c. stream the download through verifyAssetHash(stream, expectedSha256)
         → { ok, sha256, size }; INSTALL ONLY IF ok === true
      d. (optional) verify attestation_bundle against sigstore for build provenance
7. Key rotation: if kid isn't in the current JWKS, re-fetch JWKS once (cache may be stale);
   the previous key stays published so in-flight installs still verify.
8. Legacy fallback: if `jws` is absent (old release, no per-asset rows), the integrity
   doc degrades to `{ assets: { <platform>: { url, size, sha256 } } }` UNSIGNED.
   Treat unsigned installs as unverified — warn or refuse per your trust policy.
```

### Ready-made primitives — `@tabularium/manifest`

Pure Web Crypto, no node/Bun deps (runs in browser/Deno/Node≥19/Bun):

```ts
import { verifyAssetHash, verifyRegistrySignature, parseManifest, validateManifest }
  from '@tabularium/manifest'

// asset hash — streams, constant-time compare
const { ok, sha256, size } = await verifyAssetHash(response.body, expectedSha256Hex)

// registry signature (lower-level; payloadBytes = canonical JSON bytes, signature = raw 64B)
const good = await verifyRegistrySignature({ payloadBytes, signature, publicKeyJwk })
```

For the JWS itself the simplest path is jose `compactVerify(jws, publicKey)` —
it returns the canonical payload bytes, which you then `JSON.parse`.
`verifyRegistrySignature` is the dependency-free alternative if you split the
JWS into `payloadBytes` + `signature` yourself.

---

## 5. Threat model recap (why each step exists)

- **Registry is compromised / MITM** → the JWS is signed by the author-facing
  registry key; a tampered registry can't forge a valid Ed25519 signature.
- **Forge asset swapped after publish** → per-asset SHA-256 in the signed
  payload won't match; `verifyAssetHash` fails, install refused.
- **Wrong-release replay** (valid sig, different plugin/version) → §4 step 4
  guards slug/version/registry.
- **Manifest tampering** → `manifest_sha256` is inside the signed payload and
  pins `manifest_raw`, so no forge round-trip is needed or trusted.
- **Key rotation** → JWKS serves current + previous; match by `kid`.
- **Build provenance** → optional `attestation_bundle` (GitHub
  `attest-build-provenance`, sigstore) for who/what built the asset.

Net: the client gets exactly what the author published, or the install fails
closed. No trust in the network path or the registry host beyond its signing key.
