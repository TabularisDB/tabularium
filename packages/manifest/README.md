# `@tabularium/manifest`

Pure validator + integrity primitives for the Tabularium plugin registry. No Bun-specific APIs, no DB, no network — runs in Bun, Node ≥ 19, Deno, and the browser. Used by the registry server, the `@tabularium/cli` tool, and any consumer that wants to verify a release locally.

## Install

```sh
bun add @tabularium/manifest
# or
npm i @tabularium/manifest
```

## Exports

### Validation

```ts
import { parseManifest, validateManifest, buildSchema, fetchSchema, type ValidationError } from '@tabularium/manifest'
```

- **`parseManifest(text)`** — JSON → object. Throws `ParseError`. Tabularium is JSON-only.
- **`validateManifest(parsed, schema, { lenient? })`** — ajv-backed JSON Schema 2020-12 validator. Returns `{ ok: true, normalized, errors: [] }` or `{ ok: false, normalized: null, errors }`. `lenient: true` strips unknown fields via `removeAdditional: 'all'` instead of erroring.
- **`buildSchema(opts)`** — merges the core `ManifestSchema` with operator-defined extension deltas (global + per-kind) into a single JSON Schema.
- **`fetchSchema(url)`** — `GET <url>/manifest.schema.json` helper. Includes the response body in HTTP error messages.

`ValidationError` shape:

```ts
type ValidationError = {
  path: string        // JSON Pointer, e.g. "/screenshots/0/url"
  code: string        // "type", "pattern", "required", "additionalProperties", ...
  message: string     // human-readable
  expected?: unknown  // schema constraint, e.g. "https?://.+"
  actual?: unknown    // truncated to ~200 chars
}
```

### Integrity

```ts
import { canonicalize, verifyAssetHash, verifyRegistrySignature } from '@tabularium/manifest'
```

- **`canonicalize(value)`** — RFC 8785 JSON Canonicalisation Scheme. Lexicographic key order, no whitespace, RFC-compliant number serialisation, rejects `NaN`/`Infinity`/`undefined`. Used to compute deterministic bytes for signing/verification.
- **`verifyAssetHash(stream, expectedHex)`** — reads a `ReadableStream<Uint8Array>`, computes SHA-256, compares constant-time. Returns `{ ok, sha256, size }`.
- **`verifyRegistrySignature({ payloadBytes, signature, publicKeyJwk })`** — Web Crypto Ed25519 verify. Returns `boolean`.

The package intentionally does *not* parse JWS or fetch JWKS — use a JOSE library (`jose`) for that and feed the raw bytes here. This keeps the dependency surface minimal.

## Examples

### Validate a manifest

```ts
import { parseManifest, validateManifest, fetchSchema } from '@tabularium/manifest'

const text = await Bun.file('./tabularium.yaml').text()
const schema = await fetchSchema('https://registry.example.com')
const parsed = parseManifest(text, 'tabularium.yaml')
const result = validateManifest(parsed, schema)

if (!result.ok) {
  for (const e of result.errors) {
    console.error(`${e.path}  ${e.code}  ${e.message}`)
  }
  process.exit(1)
}
```

### Verify a downloaded asset

```ts
import { verifyAssetHash } from '@tabularium/manifest'

const releaseRes = await fetch('https://registry.example.com/api/plugins/my-plugin')
const plugin = await releaseRes.json() as { releases: Array<{ version: string, integrity: { jws: string, assets: Array<{ name: string, sha256: string, size: number }> } | null }> }
const release = plugin.releases[0]
const expected = release.integrity!.assets.find(a => a.name === 'my-plugin.zip')!

const assetRes = await fetch('https://github.com/me/my-plugin/releases/download/.../my-plugin.zip')
const { ok, sha256, size } = await verifyAssetHash(assetRes.body!, expected.sha256)

if (!ok) throw new Error(`hash mismatch: got ${sha256}, expected ${expected.sha256}`)
if (size !== expected.size) throw new Error(`size mismatch`)
```

### Verify the registry signature

```ts
import { canonicalize, verifyRegistrySignature } from '@tabularium/manifest'
import { compactVerify, importJWK } from 'jose'

// 1. Pull the JWKS once and cache it; rotate if `kid` no longer matches.
const jwks = await (await fetch('https://registry.example.com/.well-known/registry-key.json')).json() as { keys: Array<{ kid: string, kty: string, crv: string, x: string, alg: string }> }

// 2. Pick the key matching the JWS protected-header `kid` (decode without verifying first).
const { jws } = release.integrity!
const headerB64 = jws.split('.')[0]
const { kid } = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))))
const jwk = jwks.keys.find(k => k.kid === kid)
if (!jwk) throw new Error(`unknown kid ${kid} — JWKS may be stale`)

// 3. Verify via jose.
const key = await importJWK(jwk, 'EdDSA')
const { payload, protectedHeader } = await compactVerify(jws, key)
const body = JSON.parse(new TextDecoder().decode(payload)) as { plugin_slug: string, release_version: string, assets: Array<{ name: string, sha256: string, size: number }> }

// 4. Cross-check: the JWS-signed assets[] must include the asset you're about to install with the same sha256.
const signedAsset = body.assets.find(a => a.name === 'my-plugin.zip')
if (!signedAsset || signedAsset.sha256 !== expected.sha256) throw new Error('signed payload does not match release JSON')
```

You now have three layers of trust:

1. **Content** — SHA-256 of the actual download matches.
2. **Registry** — JWS proves the registry committed to that hash for that version.
3. **(Optional) Author** — if the asset has an `attestation_bundle`, verify it with a sigstore library to prove the GitHub Actions run that built it.

## Stability

This package follows the registry's release cycle. The `ManifestSchema` shape is versioned via the `$schema` URL and stays additive within a major version. Breaking changes to validation behaviour (lenient defaults, error codes) are called out in the changelog.
