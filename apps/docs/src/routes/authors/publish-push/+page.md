---
title: "CI-driven push"
---

# CI-driven push

Since Tabularium 0.9.0, plugin authors can publish releases directly from
their CI by presenting a **publisher token**. It's the same conceptual model
as `cargo publish` or `npm publish`: scoped tokens, owner-only writes, first
push auto-claims the slug. The webhook flow continues working unchanged —
both routes funnel through the same ingest pipeline.

## When to pick push over webhook

| Situation | Push | Webhook |
|-----------|:----:|:-------:|
| Plugin lives on a public forge with admin access | ✓ | ✓ |
| Org-owned repo where you can't grant the OAuth webhook scope | ✓ | ✗ |
| Registry not reachable from the forge | ✓ | ✗ |
| You only want the registry to ingest on green CI | ✓ | ✗ |
| You don't want to maintain a CI step at all | ✗ | ✓ |

A single plugin can use both. The most recent ingest wins.

## Token model

A publisher token carries one or more **scopes**. Each scope is
`<action>:<target>` where:

- `action` is `publish`, `yank`, or `manage-owners` (reserved for a
  future release).
- `target` is `*` (wildcard) or a plugin slug.

| Scope                  | What it lets the token do                                         |
|------------------------|-------------------------------------------------------------------|
| `publish:*`            | Create new plugins via auto-claim + update any plugin you own     |
| `publish:<slug>`       | Update releases on this one slug                                  |
| `yank:<slug>`          | Yank a release on this slug (ships in v0.10.0)                    |
| `yank:*`               | Yank releases on any plugin you own (ships in v0.10.0)            |

Tokens are user-bound — you can only publish to slugs you own. Scope checks
catch the rest.

## Mint a token

```bash
curl -X POST https://registry.example.com/api/auth/me/tokens \
  -H "Authorization: Bearer $TABULARIUM_SESSION_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub Actions",
    "scopes": ["publish:firestore"],
    "expiresAt": null
  }'
```

The response includes the plaintext token **exactly once**:

```json
{
  "token": "tpub_KJjksJ29Hf...etc",
  "row": {
    "id": "01J...",
    "name": "GitHub Actions",
    "prefix": "tpub_KJj",
    "scopes": ["publish:firestore"],
    "expiresAt": null,
    "createdAt": 1730000000000
  }
}
```

Store it as a CI secret (`TABULARIUM_TOKEN` is the convention). The registry
only persists a sha256 hash — there's no way to recover the plaintext later.

To list / revoke:

```bash
curl https://registry.example.com/api/auth/me/tokens                 # GET list
curl -X DELETE https://registry.example.com/api/auth/me/tokens/01J... # revoke
```

## Push a release

```bash
curl -X POST https://registry.example.com/api/publish/firestore \
  -H "Authorization: Bearer $TABULARIUM_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "manifest": $(jq -Rs . < .tabularium),
  "manifestSource": "tabularium.yaml",
  "version": "1.4.0",
  "assets": [
    {
      "name": "firestore-plugin-linux-x64.zip",
      "url": "https://github.com/u/firestore-tabularis/releases/download/v1.4.0/firestore-plugin-linux-x64.zip"
    }
  ],
  "repoUrl": "https://github.com/u/firestore-tabularis"
}
EOF
```

Successful response:

```json
{
  "slug": "firestore",
  "version": "1.4.0",
  "claimed": false
}
```

`claimed: true` on the first push to a new slug.

### Required vs optional fields

| Field            | Required when           | Notes                                                  |
|------------------|-------------------------|--------------------------------------------------------|
| `manifest`       | always                  | Raw YAML or JSON text (≤ 64 KiB)                       |
| `manifestSource` | always                  | `"tabularium.yaml"` or `"tabularium.json"`             |
| `version`        | always                  | semver `1.4.0` or `v1.4.0`                             |
| `assets`         | always                  | Array of `{name, url, sha256?, size?}`, max 32         |
| `repoUrl`        | first push only         | Forge anchor for the auto-claim                        |
| `attestation`    | optional                | Sigstore bundle (passthrough, not verified at ingest)  |

## CI example — GitHub Actions

Add a `publish` job to your release workflow:

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    # … build platform binaries, upload to GitHub release as today …

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Push release to Tabularium
        env:
          TABULARIUM_TOKEN: ${{ secrets.TABULARIUM_TOKEN }}
        run: |
          set -euo pipefail
          VERSION="${GITHUB_REF_NAME#v}"
          REPO="https://github.com/${GITHUB_REPOSITORY}"
          jq -n \
            --rawfile manifest .tabularium \
            --arg version "$VERSION" \
            --arg repo "$REPO" \
            --argjson assets "$(gh release view "v$VERSION" --json assets | jq '[.assets[] | {name, url}]')" '
              {
                manifest: $manifest,
                manifestSource: "tabularium.yaml",
                version: $version,
                assets: $assets,
                repoUrl: $repo
              }
            ' | \
            curl -fsS -X POST -H "Authorization: Bearer $TABULARIUM_TOKEN" \
                 -H "Content-Type: application/json" \
                 --data @- \
                 "https://registry.example.com/api/publish/${REPO##*/}"
```

The same shape works for Forgejo Actions and GitLab CI — just swap the
secret name and the `gh release view` call for the corresponding API.

## Failure codes

| Status | Audit action               | Meaning                                                    |
|-------:|----------------------------|------------------------------------------------------------|
| 401    | (none — too noisy)         | Token missing, expired, or revoked                         |
| 403    | `plugin.publish_denied`    | Token scopes don't permit the action                       |
| 400    | (none)                     | First-push without `repoUrl`, or bad `repoUrl` format      |
| 409    | `plugin.publish_conflict`  | `repoUrl` already claimed by another slug, OR same version |
| 422    | `plugin.publish_invalid`   | Manifest fails schema validation                           |
| 502    | `plugin.publish_asset_fail`| Asset URL fetch / hash failed                              |

The `errors` array in the 422 response lists every schema violation so the
CI step can print it back to the author.

## What's coming in v0.10.0

- `@tabularium/cli publish` — wraps the above curl with manifest sniffing,
  asset URL discovery from the forge, and friendly error messages.
- `POST /api/publish/:slug/yank` — pull a release out of the default list.
- `/settings/tokens` page in the registry frontend (today the token
  management is API-only).
