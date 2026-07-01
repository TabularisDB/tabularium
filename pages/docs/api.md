# API

Tabularium exposes a typed JSON API via Elysia + TypeBox. The full OpenAPI spec is at:

- HTML: `GET /openapi`
- JSON: `GET /openapi/json`

## Surfaces

| Surface | Auth | Purpose |
|---------|------|---------|
| `/api/plugins/*` | none | Browse plugins, releases, manifest |
| `/api/kinds` | none | Active plugin-kinds taxonomy (admin-defined) |
| `/api/requests/*` | optional | List plugin wishlist, upvote, create |
| `/api/pages/*` | none | Render CMS pages |
| `/api/branding` | none | Public branding payload |
| `/api/i18n` | none | Default locale + enabled languages |
| `/api/features` | none | Public feature flag state |
| `/api/submit/oauth` | cookie | Submit a plugin via linked identity |
| `/api/auth/me/tokens` | cookie / JWT | Create / list / revoke publisher tokens — see [CI-driven push](authors/publish-push.md) |
| `/api/publish/:slug` | publisher token | Token-authenticated push from CI — first push auto-claims |
| `/api/init/*` | bootstrap | Install wizard only |
| `/api/admin/*` | admin | Operator console |
| `/auth/[instance]/*` | OAuth | Provider sign-in callbacks |

## Public plugin endpoints

A handful of public endpoints under `/api/plugins` are worth calling out — they grew query parameters or response fields since the OpenAPI snapshot was first published.

### `GET /api/plugins`

Paginated catalogue. Standard filters: `search`, `category`, `tag`, `kind`, `featured=1`, `verified=1`, `sort=updated|new|name|featured`, `page`, `limit`.

- **Verified plugins lead every sort** — `verified_at IS NULL` is the leading order key, so admin-vetted entries always sit above unverified ones at equal rank.
- **Generic extension filter**: `?ext.<key>=<value>` matches against the manifest's admin-defined extension fields. The key is whatever your registry's kind / global extension schema declares (e.g. `engine`, `paradigm`, `chain`). Matches both scalar values (`"engine":"firestore"`) and array members (`"paradigms":[..., "document", ...]`). Multiple `ext.*` params AND together.

```bash
# Single scalar
curl 'https://registry.example.com/api/plugins?ext.engine=firestore'

# Array-member match (paradigms is declared as an array in the driver kind)
curl 'https://registry.example.com/api/plugins?ext.paradigms=document'

# Two filters AND-combined
curl 'https://registry.example.com/api/plugins?ext.engine=postgres&ext.paradigms=relational'
```

Response items include `verified`, `verifiedAt`, and `extensions` (the raw JSON blob captured at manifest ingest — null if the manifest declares no extension fields). Tabularium does NOT define what extensions exist — that's an admin / consumer concern, configured per kind in `/admin/kinds`.

### `GET /api/plugins/{slug}`

Returns the full plugin detail (releases, metadata, rendered README).

- Optional `?locale=<bcp47>` (`en`, `de`, `pt-BR`, …) — picks a localized README when the manifest declares `readmes`. Resolution order: exact match → base language → `en` → first available.
- Response always includes:
  - `readmeHtml` — sanitized via DOMPurify, cached 10 min.
  - `readmeLocale` — the chosen locale (`null` if the plugin only ships a single-locale README).
  - `readmeAvailableLocales` — array of locales the plugin offers; empty array for single-locale plugins. Use this to render a language switcher.
  - `verified` / `verifiedAt` — admin audit signal (see [Verification](admin/plugins.md#verification)). `verifiedBy` stays admin-only.
  - `extensions` — same JSON blob as on the list response.

### `GET /api/plugins/{slug}/latest`

Resolves the latest release for a target platform.

- `?os=` and `?arch=` are both **optional**. If the client omits them, the server inspects the request's `User-Agent`; if that still doesn't yield a match, it falls back to a `universal` asset.
- Response includes a `platforms` map alongside `download_url`, so clients can render alternatives when the picked platform is missing. The matched platform key is echoed in `platform` (or `null` if no exact match was possible).
- `422` is returned with the same `platforms` map when neither a platform-specific nor a `universal` asset is published.

### `GET /api/plugins/{slug}/stats`

**New** — lazy provider stats, no auth.

```json
{
  "stars": 142,
  "forks": 9,
  "watchers": 14,
  "lastPushAt": 1731234567000,
  "homepage": "https://example.com"
}
```

Fetched on demand from the upstream provider (GitHub, Codeberg/Gitea, GitLab) and cached for 10 minutes. Returns `null` fields when the provider is unreachable or the repo is private. The provider is picked from the plugin's `repoUrl`.

## Admin kinds endpoints

The admin console manages the plugin-kinds taxonomy under `/api/admin/kinds`:

| Verb | Path | Purpose |
|------|------|---------|
| `GET` | `/api/admin/kinds` | List every kind (including any disabled ones) |
| `POST` | `/api/admin/kinds` | Create a kind (`key`, `label`, optional `description`) |
| `PUT` | `/api/admin/kinds/:key` | Replace `label` / `description` — `key` is immutable |
| `DELETE` | `/api/admin/kinds/:key` | Remove a kind; plugins keep the tag as a freeform value |

Every mutation writes an audit-log entry. See [Kinds](admin/kinds.md) for the full reference.

## Auth

- Cookies are HTTP-only JWTs signed with the configured key. JWTs (and the cookie that carries them) are valid for **7 days**.
- API consumers can pass `Authorization: Bearer <token>` instead.
- Bootstrap admin auth uses an in-memory token; only the install wizard accepts it.

## Typed clients

### TypeScript — `@tabularium/client`

End-to-end typed via Eden Treaty (re-exports the backend's `App` type, so every endpoint, query, body, and response is type-checked at the call site).

```ts
import { createClient } from '@tabularium/client'
const eden = createClient('https://registry.example.com')
const { data, error } = await eden.api.plugins.get()
```

Bundled with the registry source tree — used internally by `@tabularium/frontend` and `@tabularium/cli`. Embed it from your own app via the workspace package once published.

### Rust — `tabularium-sdk`

Async client generated by [progenitor](https://docs.rs/progenitor) from a snapshot of the OpenAPI spec. Covers every public route — catalogue, submission, requests, admin, branding, JWKS.

```toml
[dependencies]
tabularium-sdk = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

```rust
use tabularium_sdk::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new("https://registry.example.com");
    let page = client.list_plugins().send().await?;
    for p in page.into_inner().plugins {
        println!("{} — {}", p.id, p.name);
    }
    Ok(())
}
```

For authenticated endpoints, build a `reqwest::Client` with a default `Authorization: Bearer <jwt>` header and pass it to `Client::new_with_client(base_url, client)`.

- crates.io: <https://crates.io/crates/tabularium-sdk>
- docs.rs: <https://docs.rs/tabularium-sdk>

### Validator + integrity — `@tabularium/manifest`

Pure JS/TS library — no Bun-specifics, runs in Node ≥ 19 / Deno / browser. Exports `parseManifest`, `validateManifest`, `verifyAssetHash`, `verifyRegistrySignature`. See [Consuming](consuming.md) for verification recipes.

```bash
bun add @tabularium/manifest    # or npm i @tabularium/manifest
```
