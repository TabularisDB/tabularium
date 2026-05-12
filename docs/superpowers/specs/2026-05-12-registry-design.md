# Tabularis Plugin Registry — Design Spec

**Date:** 2026-05-12  
**Status:** Approved  
**Scope:** Backend API + Frontend web panel

---

## 1. Overview

The Tabularis Plugin Registry is a dynamic web service that replaces the static `plugins/registry.json` file currently hosted on GitHub. It acts as an index-only registry — it never hosts plugin binaries, only pointers to GitHub/Gitea release assets.

The Tabularis app will be updated to point at this registry via `custom_registry_url` and consume the new structured API (with search, pagination, etc.) instead of the raw JSON blob.

**Three external consumers:**
- **Tabularis app** — fetches plugin list, installs via smart routing
- **Plugin authors** — submit and claim ownership, receive webhook secret
- **GitHub / Gitea webhooks** — push release events to keep registry in sync

---

## 2. Stack

| Concern | Package |
|---|---|
| Runtime | Bun |
| Framework | Elysia |
| Routing | `deadlinecode/elysia-file-router` (private, local build) |
| OAuth | Arctic v3 (direct, no wrapper) |
| Sessions | `@elysiajs/jwt` + `@elysiajs/bearer` |
| Database | Drizzle ORM + `bun:sqlite` |
| Migrations | `drizzle-kit` |
| Webhook HMAC | Bun native `crypto.subtle` |
| Frontend | React + Vite (served as static files via `elysia-static`) |

---

## 3. File Structure

```
registry/
├── src/
│   ├── routes/                        # elysia-file-router root
│   │   ├── api/
│   │   │   ├── plugins/
│   │   │   │   ├── index.ts           # GET /api/plugins?search=&page=&limit=
│   │   │   │   └── [slug]/
│   │   │   │       ├── index.ts       # GET /api/plugins/:slug
│   │   │   │       └── latest.ts      # GET /api/plugins/:slug/latest?os=&arch=
│   │   │   ├── submit/
│   │   │   │   ├── oauth.ts           # POST /api/submit/oauth
│   │   │   │   └── challenge/
│   │   │   │       ├── index.ts       # POST /api/submit/challenge
│   │   │   │       └── verify.ts      # GET  /api/submit/challenge/verify?token=
│   │   │   ├── requests/
│   │   │   │   ├── index.ts           # GET /api/requests, POST /api/requests
│   │   │   │   └── [id]/
│   │   │   │       └── upvote.ts      # POST /api/requests/:id/upvote
│   │   │   └── webhooks/
│   │   │       └── release.ts         # POST /api/webhooks/release
│   │   └── auth/
│   │       ├── [provider]/
│   │       │   ├── index.ts           # GET /auth/:provider[?instance=]
│   │       │   └── callback.ts        # GET /auth/:provider/callback
│   │       └── me.ts                  # GET /auth/me
│   ├── db/
│   │   ├── schema.ts                  # Drizzle table definitions
│   │   ├── index.ts                   # bun:sqlite + drizzle instance
│   │   └── migrations/
│   ├── lib/
│   │   ├── oauth.ts                   # Arctic provider factory
│   │   ├── jwt.ts                     # sign/verify helpers
│   │   ├── webhook.ts                 # HMAC-SHA256 verify + platform key inference
│   │   └── challenge.ts               # token gen + raw-file fetch + verify
│   ├── middleware/
│   │   └── auth.ts                    # Elysia derive() guard — injects authed user
│   └── index.ts                       # app bootstrap
├── frontend/                          # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Plugins.tsx
│   │   │   ├── PluginDetail.tsx
│   │   │   ├── Submit.tsx
│   │   │   └── Requests.tsx
│   │   ├── components/
│   │   ├── api/                       # typed fetch wrappers
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts
├── drizzle.config.ts
├── .env
└── package.json
```

---

## 4. Database Schema

### `users`
```
id:                    text  PK  (uuid)
provider:              text      ("github" | "gitea")
provider_instance_url: text      (null for GitHub; "https://codeberg.org" for Gitea/Forgejo)
external_id:           text      (provider's user ID)
username:              text
created_at:            integer   (unix ms)

UNIQUE (provider, provider_instance_url, external_id)
```

### `plugins`
```
id:              text  PK  (slug, e.g. "duckdb")
owner_id:        text  FK → users.id
name:            text
description:     text
author:          text      ("username <https://github.com/user>")
repo_url:        text
homepage:        text
latest_version:  text      (nullable — null until first webhook fires; denormalized, updated on each release sync)
webhook_secret:  text      (per-plugin HMAC secret, shown once on submit)
created_at:      integer
updated_at:      integer
```

### `releases`
```
id:                    text  PK  (uuid)
plugin_id:             text  FK → plugins.id
version:               text
min_tabularis_version: text      (nullable)
assets:                text      (JSON: {"linux-x64": "https://...", ...})
created_at:            integer

UNIQUE (plugin_id, version)
```

### `challenges`
```
token:      text  PK  (32 bytes hex, crypto random)
repo_url:   text
user_id:    text  FK → users.id  (nullable — can start challenge before login)
expires_at: integer               (created_at + 24h)
verified:   integer               (0 | 1)
```

### `plugin_requests`
```
id:           text  PK  (uuid)
slug:         text      (desired plugin id, e.g. "mongodb")
name:         text
description:  text
requester_id: text  FK → users.id
upvotes:      integer   (denormalized count)
created_at:   integer

UNIQUE (slug)
```

### `plugin_request_votes`
```
request_id: text  FK → plugin_requests.id
user_id:    text  FK → users.id

PRIMARY KEY (request_id, user_id)
```

---

## 5. Auth Flow

Provider `github` uses Arctic's `GitHub` class. Provider `gitea` uses Arctic's `Gitea` class with a configurable `baseURL` — works for Codeberg (`https://codeberg.org`) and any Forgejo instance.

```
GET /auth/github
  → generate state (crypto random), store in httpOnly cookie (10min TTL)
  → redirect to GitHub authorization URL

GET /auth/gitea?instance=https://codeberg.org
  → same, Gitea provider initialized with instance URL
  → instance URL encoded into state cookie

GET /auth/:provider/callback?code=&state=
  → validate state cookie (timing-safe compare)
  → exchange code → access token (Arctic)
  → fetch user profile from provider API
  → upsert users row (provider + provider_instance_url + external_id as unique key)
  → sign JWT { sub: userId, username, provider, exp: now+1h }
  → set JWT as httpOnly cookie
  → redirect to BASE_URL + /auth/success (frontend handles post-login state)

GET /auth/me  [protected]
  → verify JWT
  → return { id, username, provider, providerInstanceUrl }
```

**Auth middleware** (`src/middleware/auth.ts`): Elysia `derive()` macro. Extracts JWT from `Authorization: Bearer` header or cookie, verifies, injects `{ user }` into context. Routes opt in explicitly — no global guard.

**Env vars:**
```
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITEA_CODEBERG_CLIENT_ID
GITEA_CODEBERG_CLIENT_SECRET
JWT_SECRET
BASE_URL                        # e.g. https://registry.tabularis.dev
```

---

## 6. Plugin Submission & Verification

### Path A — OAuth (authenticated user, verifies repo ownership via provider API)

```
POST /api/submit/oauth
Auth: required
Body: { repoUrl, name, description }

1. Parse repoUrl → owner + repo
2. Call provider API:
     GitHub: GET https://api.github.com/repos/:owner/:repo
     Gitea:  GET :instance/api/v1/repos/:owner/:repo
   → verify response.owner.login === authenticated user's username
3. Derive slug from repo name
   (lowercase, strip leading "tabularis-" and trailing "-plugin")
4. Check slug not taken
5. Insert plugins row, generate webhook_secret (32 bytes hex)
6. Return { slug, webhookSecret, webhookUrl }
   webhookSecret shown ONCE — not retrievable after this response
```

### Path B — Manual URL Challenge (any git host, no OAuth required for the repo)

```
POST /api/submit/challenge
Auth: optional
Body: { repoUrl }

→ generate 32-byte hex token
→ insert challenges row (expires_at = now + 24h)
→ return { token, instructions }
   instructions: place token in .tabularis or tabularis.json at repo root

POST /api/submit/challenge/verify?token=
Auth: required
Body: { name, description }

1. Load challenge → check not expired, not already verified
2. Fetch raw file from repo (try in order):
     <repoUrl>/raw/main/.tabularis
     <repoUrl>/raw/main/tabularis.json  → parse → .tabularis_token
     <repoUrl>/raw/master/.tabularis
     <repoUrl>/raw/master/tabularis.json
3. Timing-safe compare fetched content vs stored token
4. Mark challenge verified, link to authed user
5. Derive slug, check not taken, insert plugins row + webhook_secret
6. Return { slug, webhookSecret, webhookUrl }
```

Both paths return the same response shape.

---

## 7. Webhook Sync

```
POST /api/webhooks/release
Headers: x-hub-signature-256: sha256=<hmac>
         x-github-event: release  OR  x-gitea-event: release

1. Buffer raw request body (HMAC computed over raw bytes)
2. Match repo: payload.repository.html_url → plugins.repo_url
3. Verify HMAC-SHA256(plugin.webhook_secret, rawBody) == header value
   (timing-safe compare) → 401 on mismatch
4. Skip if payload.action !== "published"
5. Parse release:
     version = payload.release.tag_name (strip leading "v")
     assets  = payload.release.assets
       → infer platform key from filename:
           contains "linux-arm64"  → "linux-arm64"
           contains "linux-x64" or "linux-amd64"  → "linux-x64"
           contains "darwin-arm64" or "macos-arm64" → "darwin-arm64"
           contains "darwin-x64" or "macos-x64"    → "darwin-x64"
           contains "win-x64" or "windows-x64"     → "win-x64"
           contains "universal"                    → "universal"
           no match → skip asset
       → build { platformKey: browser_download_url }
6. Upsert releases row (INSERT OR REPLACE on plugin_id + version)
7. If semver(version) > semver(plugins.latest_version):
     UPDATE plugins SET latest_version = version, updated_at = now
8. Return 200 { ok: true }
```

---

## 8. Plugin List, CLI Route & Requests API

```
GET /api/plugins?search=&page=1&limit=20
→ {
    total, page, limit,
    plugins: [{ id, name, description, author, homepage,
                latest_version, releases: [{ version, min_tabularis_version, assets }] }]
  }

GET /api/plugins/:slug
→ full plugin object with all releases

GET /api/plugins/:slug/latest?os=linux&arch=x64
→ { version, min_tabularis_version, download_url }
→ 404 if slug not found
→ 422 if os/arch not in latest release's assets
   (os + arch are joined to platform key: "linux" + "x64" → "linux-x64")

POST /api/requests
Auth: required
Body: { slug, name, description }
→ insert plugin_requests (slug unique — 409 if already requested)
→ return created request object

GET /api/requests?page=1&limit=20&sort=upvotes|recent
→ { total, page, requests: [{ id, slug, name, description, upvotes, created_at }] }

POST /api/requests/:id/upvote
Auth: required
→ toggle: insert vote row if not exists, delete if exists
→ update plugin_requests.upvotes count
→ return { upvotes, voted: boolean }
```

---

## 9. Frontend (React + Vite)

Vite builds to `frontend/dist/`. Elysia serves `dist/` as static files. All API calls go to the same origin — no CORS config needed.

**Pages:**

| Route | Content |
|---|---|
| `/` | Homepage — plugin grid + top requested plugins CTA |
| `/plugins` | Searchable, paginated plugin browser |
| `/plugins/:slug` | Plugin detail — versions, platform support table, install CLI snippet |
| `/submit` | Two-path submit wizard (OAuth picker or manual challenge) |
| `/requests` | Community request board, sorted by upvotes, submit new request |
| `/auth/login` | OAuth provider picker (GitHub / Codeberg / Forgejo) |
| `/auth/success` | Post-OAuth landing — reads JWT cookie, stores in app state, redirects |

Frontend `api/` folder contains typed fetch wrappers for all endpoints — no external HTTP client dependency.

---

## 10. Bootstrap Order

1. Clone + build `deadlinecode/elysia-file-router` → link locally
2. `bun init` in registry dir
3. Install deps
4. Run `drizzle-kit generate` + `drizzle-kit migrate`
5. Implement in route order: auth → plugins list → submit → webhooks → requests
6. Build frontend last (served from same process)
