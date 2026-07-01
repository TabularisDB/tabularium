---
title: "Publishing"
---

# Publishing

For authors releasing plugins through a Tabularium registry. Covers validating your manifest in CI, what the registry signs on your behalf, and how to add upstream build-provenance attestation.

> **Push from CI directly?** Since 0.9.0, plugin authors can publish releases from CI with a scoped publisher token instead of relying on the webhook event. See [CI-driven push](/authors/publish-push/) for the workflow.

## What gets indexed

A release is the combination of:

1. A manifest file (`tabularium.yaml`, `tabularium.json`, `.tabularium`, …) at the root of your repository — see [Manifest](/manifest/)
2. A versioned release on your forge (GitHub, Forgejo, GitLab, Gitea) with one or more downloadable assets — **including the manifest itself as one of the assets** (see [Upload the manifest as a release asset](#Upload-the-manifest-as-a-release-asset) below)

The registry watches your release webhooks, fetches the manifest from the release assets, computes a SHA-256 of every release asset within its hash budget, and signs the bundle.

## Upload the manifest as a release asset

Since Tabularium 0.8.0, the registry resolves your manifest from the **release assets** rather than from the git ref at the tag. Assets are immutable per release and served by the forge's CDN, which removes a class of timing races and OAuth hiccups that the git-ref fetch was prone to.

**What you have to do:** include your manifest file as one of the release assets your CI uploads. The filename must match one of the names in the registry's manifest-candidate whitelist (default: `.tabularium`, `.tabularium.json`, `tabularium.yaml`, `tabularium.json`).

**GitHub Actions** — extend your release job to upload the manifest alongside your binaries:

```yaml
- uses: softprops/action-gh-release@v2
  with:
    files: |
      dist/*.zip
      .tabularium    # ← upload the manifest
```

**Forgejo Actions:**

```yaml
- name: Publish release
  run: |
    fj release create v${VERSION} \
      --attach dist/myplugin.zip \
      --attach .tabularium
```

A registry running in strict mode (`manifest.require_release_asset=1`, the default) will hard-reject the ingest with a `plugin.manifest_asset_missing` audit entry when none of the candidate filenames is published. Operators rolling out asset-based ingest on an existing registry can flip the setting to `0` to fall back to the legacy git-ref fetch until every plugin has migrated.

## CLI

`@tabularium/cli` validates your manifest locally before you push. It is intentionally separate from the registry — you can validate in CI without depending on a running registry.

```bash
bun add -d @tabularium/cli
# or: npm install -D @tabularium/cli
```

```bash
# Auto-detects tabularium.yaml or tabularium.json in cwd
bunx tabularium validate

# Or point at a specific file
bunx tabularium validate path/to/tabularium.yaml

# Pick a manifest kind explicitly (defaults to inferring from `kind:`)
bunx tabularium validate --kind plugin
```

Exit codes: `0` on a valid manifest; `1` on schema mismatch, unknown `kind`, duplicate identifiers, or any consistency failure. The error message names the field.

## CI examples

**GitHub Actions:**

```yaml
name: Validate manifest
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bunx @tabularium/cli validate
```

**Forgejo Actions** (same syntax, different runner):

```yaml
name: Validate manifest
on: [push, pull_request]
jobs:
  validate:
    runs-on: docker
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bunx @tabularium/cli validate
```

Block merge on failure — consumers get a much worse experience if a broken manifest reaches the registry.

## What the registry signs

The registry builds a canonical payload (RFC 8785 JSON Canonicalization Scheme) shaped like:

```json
{
  "slug": "my-plugin",
  "version": "1.4.0",
  "manifest_sha256": "...",
  "assets": [
    {
      "name": "my-plugin-linux-x64.zip",
      "sha256": "...",
      "size": 1234567,
      "contentType": "application/zip",
      "arch": "x64",
      "os": "linux",
      "attestation": null
    }
  ]
}
```

…then signs it with its Ed25519 key (EdDSA, JWS compact form). The JWS surfaces on:

- `GET /api/plugins/:slug/releases/:version` — `integrity.jws`
- `GET /api/plugins/:slug/releases/latest` — `integrity.jws`

You don't have to do anything to enable this — the registry signs every release automatically.

## Assets above the hash budget

If a release asset is larger than the registry's hash budget (default 500 MB), the registry skips hashing it. The release still ingests, but that asset doesn't appear in the signed `integrity.assets` list. Strict consumers will refuse those assets.

If you distribute large binaries and want them in the integrity payload, ask the registry operator to raise the budget. See [Security](/admin/security/).

## GitHub build-provenance attestation

If your release builds on GitHub Actions, you can publish sigstore attestations linking the asset hash to the workflow that built it. The registry relays these attestations into the integrity payload (passthrough — it doesn't verify them itself); consumers can verify the bundle locally.

```yaml
name: Release
on:
  push:
    tags: ['v*']

permissions:
  contents: write
  id-token: write     # required for OIDC -> sigstore
  attestations: write # required for attest-build-provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build.sh

      - uses: actions/attest-build-provenance@v2
        with:
          subject-path: 'dist/*.zip'

      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*.zip
```

The registry's ingest fetches the attestation via `/repos/:owner/:repo/attestations/sha256:<hex>` and embeds the sigstore bundle in `release_assets.attestationBundle`. Opt-in and additive — releases without attestation still get the registry signature.

Forgejo / GitLab / Gitea attestation pass-through may be added later; until then, only GitHub releases get this.

## Versioning

The registry indexes by `(slug, version)`. Version is parsed from the release tag (`v1.4.0` → `1.4.0`). Keep tags immutable once published, match the version in `tabularium.yaml`, and use SemVer if you want the `/latest` endpoint to pick correctly.

## FAQ

**Can I sign releases myself instead of relying on the registry?** The registry signature is a registry-trust statement ("the registry observed these hashes at ingest"), not an author-trust statement. If you want author-trust, publish build-provenance attestations — those bind the asset hash to your CI workflow's OIDC identity. The registry pass-through preserves that.

**What if I delete a release and re-publish with the same tag?** The registry re-ingests, recomputes hashes, re-signs. The new JWS replaces the old one. Anyone who cached the old `integrity.jws` will see a signature mismatch — which is correct: the artifact changed.

**My release has 50 assets across platforms. Will this blow up?** The ingest pipeline streams each asset under the hash budget and discards the bytes after hashing. 50 small assets is fine; 50 × 500 MB is not — consider whether you actually need them all in the integrity list.

**Does the CLI need network access?** No. `tabularium validate` is pure local schema + consistency checks.
