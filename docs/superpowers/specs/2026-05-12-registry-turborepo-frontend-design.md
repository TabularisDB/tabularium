# Tabularis Registry — Turborepo, OpenAPI & Frontend Design Spec

**Date:** 2026-05-12
**Status:** Approved
**Scope:** Repo restructure + OpenAPI on backend + React frontend
**Prereq:** Backend API complete (see `2026-05-12-registry-design.md` and `plans/2026-05-12-registry-backend.md`)

---

## 1. Overview

Three changes layered on the working backend:

1. **Turborepo restructure** — promote `registry/` to a monorepo root with `apps/backend` and `apps/frontend` workspaces.
2. **OpenAPI + Eden Treaty** — add `@elysiajs/openapi` so the backend exposes a spec and Scalar UI; expose the backend `App` type so the frontend can call it via Eden Treaty.
3. **React frontend** — Vite + React 19 + TanStack Router + TanStack Query + Tailwind v4 + shadcn/ui. Seven pages, JWT-cookie auth, served as static files from the backend in production.

Implementation is split into two sequenced plans:
- **Plan A** — Restructure + OpenAPI (mechanical; touches every backend path)
- **Plan B** — Frontend (builds on the new structure)

---

## 2. Turborepo Structure

The monorepo root stays at `/home/newt/Projekte/Personal/TabularisDB/registry/` to preserve git history. Existing files move into `apps/backend/`.

```
TabularisDB/registry/                       # monorepo root
├── apps/
│   ├── backend/                            # everything from current src/, tests/, etc.
│   │   ├── src/
│   │   ├── tests/
│   │   ├── bunfig.toml
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json                    # name: "@tabularis/registry-backend"
│   └── frontend/                           # new Vite + React app
│       ├── src/
│       │   ├── routes/                     # TanStack Router file-based routes
│       │   ├── components/
│       │   ├── lib/
│       │   └── main.tsx
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json                    # name: "@tabularis/registry-frontend"
├── packages/
│   └── tsconfig/                           # shared "base.json" extended by both apps
│       ├── base.json
│       └── package.json
├── turbo.json
├── package.json                            # workspaces: ["apps/*", "packages/*"]
├── bun.lock
└── docs/superpowers/                       # specs + plans live at root
```

**Workspace tool:** Bun workspaces (`"workspaces": ["apps/*", "packages/*"]`) + Turbo. `bun install` at the root resolves every workspace.

**`turbo.json` pipeline:**
- `dev` — runs `apps/backend` and `apps/frontend` in parallel. Backend on `:3000`, frontend Vite dev on `:5180` with a proxy for `/api/*` and `/auth/*` to backend.
- `build` — `apps/backend#build` (no-op, runs `bun src/index.ts` only at runtime) and `apps/frontend#build` (Vite production build to `apps/frontend/dist`).
- `test` — runs `bun test` in each workspace (frontend's test suite stays small).
- `lint` — placeholder; no linter pinned by this spec.

**Production serving:** Backend continues to serve static files from a `frontend/dist` location via `@elysiajs/static`. The static mount path changes to `../frontend/dist` (relative to `apps/backend/`).

**Vendor:** `/home/newt/Projekte/Personal/TabularisDB/vendor/elysia-file-router/` stays in place. `apps/backend/package.json` references it via the tarball install (`file:.../elysia-file-router-0.0.1.tgz`). The `overrides.elysia` field stays.

---

## 3. File-Router Refactor

The flat `loadRoutes()` helper introduced as a temporary fix is removed and the original `fileRouter()` is restored.

**Why this matters:** The file-router auto-derives URL prefixes from the directory structure. Each route handler must declare its path **relative** to that prefix, not the full URL.

### 3.1 Route handler path changes

For every route in `apps/backend/src/routes/`:

| File | Old handler path | New handler path |
|---|---|---|
| `auth/me.ts` | `.get('/auth/me', ...)` | `.get('/', ...)` |
| `auth/[provider]/index.ts` | `.get('/auth/:provider', ...)` | `.get('/', ...)` |
| `auth/[provider]/callback.ts` | `.get('/auth/:provider/callback', ...)` | `.get('/', ...)` |
| `api/plugins/index.ts` | `.get('/api/plugins', ...)` | `.get('/', ...)` |
| `api/plugins/[slug]/index.ts` | `.get('/api/plugins/:slug', ...)` | `.get('/', ...)` |
| `api/plugins/[slug]/latest.ts` | `.get('/api/plugins/:slug/latest', ...)` | `.get('/', ...)` |
| `api/submit/oauth.ts` | `.post('/api/submit/oauth', ...)` | `.post('/', ...)` |
| `api/submit/challenge/index.ts` | `.post('/api/submit/challenge', ...)` | `.post('/', ...)` |
| `api/submit/challenge/verify.ts` | `.post('/api/submit/challenge/verify', ...)` | `.post('/', ...)` |
| `api/webhooks/release.ts` | `.post('/api/webhooks/release', ...)` | `.post('/', ...)` |
| `api/requests/index.ts` | `.get('/api/requests',...)` + `.post('/api/requests',...)` | `.get('/', ...)` + `.post('/', ...)` |
| `api/requests/[id]/upvote.ts` | `.post('/api/requests/:id/upvote', ...)` | `.post('/', ...)` |

### 3.2 Test mounting changes

Tests currently do:
```typescript
const app = new Elysia().use(pluginsIndex)
```

That works only because the route declared its full path. After the refactor, the route at `/` would 404 for requests to `/api/plugins`.

**Fix:** introduce `tests/helpers.ts → buildApp()` that calls `fileRouter()` once against `src/routes/`:
```typescript
import { fileRouter } from 'elysia-file-router'
import { Elysia } from 'elysia'
import { resolve } from 'node:path'

export async function buildApp() {
  return new Elysia().use(
    await fileRouter({ dir: resolve('./src/routes'), types: false, logLevel: 'silent' })
  )
}
```

Every existing `buildXxxApp()` in the test files is replaced by `buildApp()`. All routes are mounted in every test, but `clearDb()` between tests keeps isolation. Test URL paths are unchanged (`/api/plugins`, `/auth/me`, etc.).

### 3.3 `src/index.ts` restoration

```typescript
import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'
import staticPlugin from '@elysiajs/static'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'

const app = new Elysia({ systemRouter: false })
  .use(openapi({ /* see Section 4 */ }))
  .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/' }))
  .use(await fileRouter({ dir: resolve('./src/routes'), types: false }))
  .listen(Number(Bun.env.PORT ?? 3000))

console.log(`Registry running on http://localhost:${app.server?.port}`)

export type App = typeof app
```

`{ systemRouter: false }` stays — it sidesteps Bun's native router duplicate-parameter limitation.

---

## 4. OpenAPI + Eden Treaty

### 4.1 OpenAPI plugin

Install `@elysiajs/openapi` in `apps/backend`. Configure with API metadata:

```typescript
openapi({
  documentation: {
    info: {
      title: 'Tabularis Plugin Registry API',
      version: '1.0.0',
      description: 'Index, submit, and discover plugins for the Tabularis app.',
    },
    servers: [{ url: 'https://registry.tabularis.dev', description: 'Production' }],
    tags: [
      { name: 'Plugins', description: 'List, search, and inspect plugins' },
      { name: 'Auth', description: 'OAuth login with GitHub or Gitea/Forgejo' },
      { name: 'Submit', description: 'Submit a new plugin' },
      { name: 'Webhooks', description: 'Release sync from GitHub/Gitea' },
      { name: 'Requests', description: 'Community plugin wish list' },
    ],
  },
  scalar: { theme: 'default' },
})
```

This exposes:
- `GET /openapi/json` — machine-readable spec
- `GET /openapi` — Scalar UI for browsing

Every route gets a `detail.tags: ['Plugins']` (or appropriate tag) in its Elysia options. Routes that return structured JSON also get a `response: t.Object(...)` schema so the OpenAPI output is precise. Routes that return raw responses (redirects, file downloads) don't need response schemas.

### 4.2 Eden Treaty client

`apps/frontend` adds `"@tabularis/registry-backend": "workspace:*"` to its dependencies. Inside `apps/frontend/src/lib/api.ts`:

```typescript
import { treaty } from '@elysiajs/eden'
import type { App } from '@tabularis/registry-backend/src'

export const api = treaty<App>(
  import.meta.env.DEV ? 'http://localhost:3000' : ''
)
```

In dev, hit the backend directly (the Vite proxy is no longer needed for API calls — Eden Treaty drives full URLs). In prod, `''` means "same origin", which matches how the frontend is served by the backend.

Frontend pages call `api.api.plugins.get({ query: { search, page } })` etc. Return types are inferred from the backend route's response schemas.

---

## 5. Frontend

### 5.1 Stack

| Concern | Choice |
|---|---|
| Build | Vite 5 (Rolldown when stable) |
| Runtime | React 19 + TypeScript |
| Routing | TanStack Router (file-based) |
| Data | TanStack Query + Eden Treaty |
| Styling | Tailwind v4 (CSS-first, no config file) |
| Components | shadcn/ui (copied into `src/components/ui/`) |
| Icons | Lucide React |
| Forms | React Hook Form + Zod (for submit + request forms) |

No global state library — TanStack Query covers server state, React `useState`/`useReducer` covers local UI state, auth state is a TanStack Query for `/auth/me`.

### 5.2 Pages

| Route | File | Description |
|---|---|---|
| `/` | `routes/index.tsx` | Hero, "popular plugins" grid (top 6 from `/api/plugins`), "top requests" card, install snippet |
| `/plugins` | `routes/plugins/index.tsx` | Search input (debounced) + paginated grid, links to detail |
| `/plugins/$slug` | `routes/plugins/$slug.tsx` | Detail: header, description, versions table with platform matrix, install snippet for the user's OS |
| `/submit` | `routes/submit.tsx` | Two-path wizard. Path A (OAuth): button to sign in, then form for repo URL + name + description. Path B (challenge): repo URL → token + instructions card → after placement, "I've placed it" button calls verify with metadata form |
| `/requests` | `routes/requests.tsx` | List with sort toggle (upvotes / recent), upvote button (auth-gated), "Request a plugin" inline form |
| `/auth/login` | `routes/auth/login.tsx` | GitHub button, Codeberg button, Forgejo instance input + button |
| `/auth/success` | `routes/auth/success.tsx` | Calls `/auth/me`, shows username, redirects back to the page they came from (via `?from=` param) |

### 5.3 Auth

The backend already sets a JWT in an httpOnly cookie on successful OAuth callback. The frontend never touches the token directly.

```typescript
// src/lib/auth.ts
export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data, error } = await api.auth.me.get({
        fetch: { credentials: 'include' },
      })
      if (error) return null
      return data
    },
    retry: false,
  })
}
```

Components that need a user check `useAuth()`; routes that require auth redirect to `/auth/login` if the query returns null. The `/auth/login` page links to `/auth/github` (and `/auth/gitea?instance=...`) — those are the backend routes that initiate the OAuth flow and ultimately set the cookie.

A logout button is **not** in scope for this spec — the JWT expires in 1h. Add `POST /auth/logout` later if needed.

### 5.4 Look and feel

- Clean dev-tools registry aesthetic (think `crates.io`, `pkg.go.dev`, `bun.sh`).
- Light + dark mode via Tailwind's `dark:` variant; toggle in the header.
- Sticky header with logo, "Plugins", "Requests", "Submit", and (when logged in) the username/avatar.
- Code blocks use a monospace font with subtle background.
- The plugin detail "platform support" is a simple table with check / dash icons.

shadcn primitives in use: `button`, `input`, `card`, `badge`, `tabs` (submit wizard), `dialog`, `select`, `table`, `skeleton`, `toast` (sonner).

### 5.5 Production hosting

The backend's `@elysiajs/static` plugin already mounts `frontend/dist` at `/`. After the restructure, the mount path becomes `../frontend/dist` (relative to `apps/backend`'s cwd). The frontend builds to `apps/frontend/dist/` during `turbo run build`. SPA fallback: any unmatched non-API route should serve `index.html` so deep links work — implemented by registering `app.onError(({ code, ... }) => code === 'NOT_FOUND' ? Bun.file('../frontend/dist/index.html') : ...)` on the root Elysia in `src/index.ts` (after the file-router is mounted). This guarantees specific API routes match first and only true 404s fall through to the SPA shell.

---

## 6. Implementation Order

Two separate plans (each with its own `writing-plans` invocation):

### Plan A — Restructure + OpenAPI

Sequenced tasks:
1. Create `apps/backend/` and move all current backend files into it (`git mv`).
2. Create root `package.json` (workspaces), `turbo.json`, `packages/tsconfig/base.json`.
3. Run `bun install` at root — verify everything still works.
4. Refactor all 12 route files to use relative paths (`/`).
5. Add `tests/helpers.ts → buildApp()`. Update every `buildXxxApp()` in tests to use it.
6. Restore `fileRouter()` in `src/index.ts`. Remove the flat `loadRoutes()` helper.
7. Add `@elysiajs/openapi` plugin with the metadata config; add `detail.tags` to every route; add `response` schemas to the routes that return structured JSON.
8. Verify: `bun test` passes 55/55, `bun src/index.ts` serves data, `/openapi/json` returns valid spec, `/openapi` shows Scalar UI.
9. Commit.

### Plan B — Frontend

Sequenced tasks:
1. Scaffold `apps/frontend` with Vite + React + TS template.
2. Install Tailwind v4, shadcn/ui, TanStack Router, TanStack Query, `@elysiajs/eden`, React Hook Form + Zod, Lucide.
3. Configure Vite proxy + SPA build output.
4. Set up `src/lib/api.ts` (Eden Treaty client) and `src/lib/auth.ts`.
5. Implement layout shell (header, theme toggle, footer).
6. Implement pages in order: home → plugins list → plugin detail → requests → auth/login → auth/success → submit (most complex last).
7. Add the SPA fallback route on the backend.
8. Production smoke test: build frontend, run backend, visit `http://localhost:3000`, verify SSR-less navigation works.
9. Commit.

---

## 7. Out of Scope

- Logout endpoint and frontend logout button (1h JWT TTL handles this for now).
- Plugin author dashboard (manage own plugins, regenerate webhook secret).
- Admin moderation (delete plugins, ban users, approve requests).
- Notifications (request "your plugin idea got upvoted" emails).
- I18n. The UI is English-only for v1.
- E2E tests. Backend integration tests in `apps/backend/tests/` cover the API; frontend tests are minimal smoke checks.
- The Tabularis app integration. That's a change in the Tabularis repo, tracked separately.
