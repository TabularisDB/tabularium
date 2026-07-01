# Security

The Security tab covers the registry signing key, the asset hash budget, and the integrity backfill.

The registry signs every release with an Ed25519 keypair. Consumers fetch the JWS, verify against the registry's public JWKS, then verify each asset they download against the listed SHA-256. The registry does not host assets — it asserts "I observed these hashes at ingest, here is my signature on that bundle."

## Release signing key

| Field | What |
|-------|------|
| kid | First 16 hex chars of `sha256(public_key_x)` — used by consumers to pick the right verifier |
| Created | When the active key was generated |
| Previous | The most recently rotated-out key, kept for verification of older signatures |

The private key is encrypted at rest with `TOKEN_ENC_KEY` (AES-256-GCM). Lose `TOKEN_ENC_KEY` and you can't sign new releases — you must rotate.

**Rotate signing key** generates a new keypair, moves the current key into the "previous" slot, and starts signing new releases with the new key. The previous key remains in the JWKS so its existing signatures still verify until the next rotation displaces it.

Audit entry: `registry.signing_key.rotate` with `{ oldKid, newKid }`.

When to rotate: periodically (annual is reasonable), after any suspected compromise of `TOKEN_ENC_KEY` or the host, after operator handover, or after exporting the encrypted settings table somewhere untrusted.

## Asset hash budget

Per-asset cap (default 500 MB, max 16 GiB) for SHA-256 hashing on the ingest side. This is **not** a publish-size cap — the registry doesn't host assets. The budget bounds how big an asset the ingest pipeline is willing to stream-download to compute a hash.

Assets above the budget still ingest (release row created, manifest indexed) but get no integrity entry. An audit warning fires.

Audit entry: `release.asset_skipped` with `{ releaseId, name, size, cap, reason: 'over_hash_budget' }`.

Raise the budget if you distribute large binaries (game data, ML models, full toolchain bundles) and want them in the integrity payload. Cost is ingest-side bandwidth + CPU; consumers pay nothing extra (the hash size is fixed). Lower the budget if you're on a metered egress link.

## Integrity backfill

Re-runs hashing + integrity-row creation for every release that doesn't have a `release_assets` row yet. Idempotent on `(release_id, name)`.

Use it after upgrading from a pre-integrity version, after re-importing releases from a backup, or after raising the hash budget so previously-skipped assets retry.

The Security tab button returns HTTP 202 and fires the backfill in the background — watch `audit_log` for completion. The backfill also auto-runs at boot when `release_assets` is behind `releases` (the button bypasses that gate).

Audit entries during backfill:

- `release.asset_hashed` per asset
- `release.asset_skipped` per over-budget asset
- `release.backfill_run` with `{ processed, skipped, errors }` on completion

## JWKS endpoint

`GET /.well-known/registry-key.json`

```json
{
  "keys": [
    { "kty": "OKP", "crv": "Ed25519", "kid": "…", "x": "…", "use": "sig", "alg": "EdDSA" },
    { "kty": "OKP", "crv": "Ed25519", "kid": "…", "x": "…", "use": "sig", "alg": "EdDSA" }
  ]
}
```

The current key is first, the previous key (if any) second. Aggressive CDN caching is fine — consumers refresh on a `kid` miss.

## GitHub artifact attestation relay

When a release asset comes from a GitHub release and the upstream repo publishes `actions/attest-build-provenance` attestations, the registry fetches them via `GET /repos/:owner/:repo/attestations/sha256:<hex>` and stores the sigstore bundle in `release_assets.attestationBundle` as a passthrough.

Set a `GITHUB_TOKEN` (or instance-scoped GitHub App credentials) with `contents:read` on the relevant repos. Without it, public attestation fetches may hit rate limits and silently skip. Failures log `attestation | attestation fetch failed` but never block ingest.

Forgejo / GitLab / Gitea attestation relays may be added later.

## Audit entries summary

| Entry | Fired when |
|---|---|
| `registry.signing_key.rotate` | Admin rotates the signing key |
| `release.asset_hashed` | Asset SHA-256 computed during ingest or backfill |
| `release.asset_skipped` | Asset exceeds the hash budget |
| `release.backfill_run` | Manual backfill completes |

## FAQ

**Lost `TOKEN_ENC_KEY` — can I recover the signing key?** No. Generate a new `TOKEN_ENC_KEY`, clear `registry.signing_key.private`, and rotate via `POST /api/admin/instance/security/rotate` to seed a fresh key. Existing signatures become unverifiable.

**Can I import an existing keypair?** Not via the UI. You'd insert directly into `settings` (`registry.signing_key.{public,private,kid,created_at}`), with the private encrypted using the same envelope format `setSetting(_, _, { encrypted: true })` produces. Not recommended.

**What happens to assets without an integrity entry?** The release endpoint still returns them in `release.assets` (the legacy JSON column). The signed `integrity` object on the release just omits them. Strict consumers reject those assets; permissive consumers accept them as unsigned.

**Rotation cadence?** Annual is fine for single-tenant. Rotate immediately on operator handover, key custody change, or suspected leak. Rotation is cheap — the previous key stays verifiable.
