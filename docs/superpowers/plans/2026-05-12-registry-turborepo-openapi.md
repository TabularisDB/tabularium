# Turborepo + OpenAPI Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the registry into a Bun + Turborepo monorepo with `apps/backend`, restore the file-router-driven routing (relative paths in each route handler), and add `@elysiajs/openapi` so the backend exposes a machine-readable spec plus a Scalar UI. Backend tests must remain 55/55 green throughout.

**Architecture:** The current backend files move into `apps/backend/` via `git mv`. A root `package.json` declares Bun workspaces (`apps/*`, `packages/*`) and pulls in Turbo to orchestrate `dev` / `build` / `test` across packages. The flat `loadRoutes()` helper introduced as a temporary fix is removed; the original `elysia-file-router` (installed via tarball) is wired back in, which requires every route handler to declare its URL **relative to the directory prefix** (`/` instead of the full path). Tests gain a single `buildApp()` helper that mounts the whole router so URL paths in test requests stay unchanged. `@elysiajs/openapi` is added with route tags and `response` schemas so the generated spec is precise.

**Tech Stack:** Bun workspaces, Turbo, Elysia 1.4.x with `systemRouter: false`, `elysia-file-router` (vendored tarball), `@elysiajs/openapi` with Scalar UI, Drizzle ORM, `bun:sqlite`.

---

## File Map

```
TabularisDB/registry/                          # monorepo root (existing dir, repurposed)
├── package.json                               # NEW: workspaces + turbo
├── turbo.json                                 # NEW
├── bun.lock                                   # regenerated
├── packages/
│   └── tsconfig/
│       ├── package.json                       # NEW: { "name": "@tabularis/tsconfig" }
│       └── base.json                          # NEW: shared TS compilerOptions
├── apps/
│   └── backend/                               # all current backend files move here via git mv
│       ├── src/                               # moved
│       ├── tests/                             # moved
│       ├── data/                              # moved (already gitignored)
│       ├── docs/                              # NOT moved — stays at root
│       ├── bunfig.toml                        # moved
│       ├── drizzle.config.ts                  # moved
│       ├── tsconfig.json                      # moved + edited to extend @tabularis/tsconfig
│       ├── package.json                       # moved + renamed
│       ├── .env.example                       # moved
│       └── .gitignore                         # moved
└── docs/                                      # spec + plans stay at monorepo root
```

Plus modifications:

- `apps/backend/src/routes/**/*.ts` (12 files) — change handler paths from full URL to `/`.
- `apps/backend/tests/helpers.ts` — add `buildApp()`.
- `apps/backend/tests/routes/*.test.ts` (6 files) — replace per-test `buildXxxApp()` with shared `buildApp()`.
- `apps/backend/src/index.ts` — restore `fileRouter()`, add `openapi()`, add SPA fallback via `onError`.
- Every route file — add `detail: { tags: ['<group>'] }` to its Elysia handler options.
- Routes returning structured JSON — add `response: t.Object(...)` schemas.

---

## Task 1: Create monorepo root skeleton

**Files:**
- Create: `package.json` (at repo root)
- Create: `turbo.json` (at repo root)
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`

- [ ] **Step 1: Confirm starting state**

```bash
pwd
# Expected: /home/newt/Projekte/Personal/TabularisDB/registry
git status
# Expected: clean working tree on feat/registry-backend
ls
# Expected: src tests docs data .env.example .gitignore bunfig.toml drizzle.config.ts package.json tsconfig.json README.md CLAUDE.md bun.lock node_modules
```

If `git status` is not clean, stop and ask. If you are not on `feat/registry-backend`, stop and ask.

- [ ] **Step 2: Write the root `package.json`**

```bash
cat > package.json <<'EOF'
{
  "name": "tabularis-registry",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "migrate": "bun --cwd apps/backend run migrate",
    "generate": "bun --cwd apps/backend run generate",
    "seed": "bun --cwd apps/backend run seed"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "turbo": "^2.5.6",
    "typescript": "^5.7.0"
  },
  "overrides": {
    "elysia": "^1.4.28"
  },
  "packageManager": "bun@1.3.12"
}
EOF
```

The `overrides` field that previously lived in the old `package.json` is preserved here so transitively-installed elysia (e.g. inside the vendored router tarball) dedupes onto a single version.

- [ ] **Step 3: Write `turbo.json`**

```bash
cat > turbo.json <<'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "outputs": ["dist/**"]
    },
    "test": {
      "outputs": [],
      "dependsOn": []
    },
    "lint": {
      "outputs": []
    }
  }
}
EOF
```

- [ ] **Step 4: Write `packages/tsconfig/package.json`**

```bash
mkdir -p packages/tsconfig
cat > packages/tsconfig/package.json <<'EOF'
{
  "name": "@tabularis/tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json"]
}
EOF
```

- [ ] **Step 5: Write `packages/tsconfig/base.json`**

```bash
cat > packages/tsconfig/base.json <<'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
EOF
```

- [ ] **Step 6: Commit (do not install yet — backend files still at root, install in a later task)**

```bash
git add package.json turbo.json packages/
git commit -m "chore: scaffold turborepo root and shared tsconfig package"
```

Expected: one commit with 4 files.

---

## Task 2: Move backend files into apps/backend

**Files:**
- `git mv` everything except `docs/`, `node_modules/`, `bun.lock`, root configs created in Task 1, README.md, CLAUDE.md.

- [ ] **Step 1: Create the destination directory**

```bash
mkdir -p apps/backend
```

- [ ] **Step 2: Move backend source and config files with git mv (preserves history)**

Run each command separately. If any errors, stop.

```bash
git mv src apps/backend/src
git mv tests apps/backend/tests
git mv bunfig.toml apps/backend/bunfig.toml
git mv drizzle.config.ts apps/backend/drizzle.config.ts
git mv tsconfig.json apps/backend/tsconfig.json
git mv .env.example apps/backend/.env.example
```

If `.gitignore` at the repo root contains backend-specific entries, leave it at root (will be edited in Step 4). If you see `.env`, it is gitignored and should already not be tracked.

- [ ] **Step 3: Move the unstaged `index.ts` from the previous bootstrap (it's untracked)**

```bash
mv index.ts apps/backend/index.ts 2>/dev/null || true
mv README.md apps/backend/README.md 2>/dev/null || true
```

(These two files are leftovers from `bun init`. They're not load-bearing but keep them with the backend.)

- [ ] **Step 4: Update root `.gitignore` to a minimal version, and create one for the backend**

```bash
cat > .gitignore <<'EOF'
node_modules/
.turbo/
dist/
.env
.env.local
EOF
cat > apps/backend/.gitignore <<'EOF'
data/
routes.ts
EOF
```

The root file covers monorepo-wide things; the backend file covers what was in the old root `.gitignore` that is backend-specific.

- [ ] **Step 5: Move the old root `package.json` content into `apps/backend/package.json`**

The existing root `package.json` no longer exists at root (you wrote a new one in Task 1). The previous backend `package.json` content must be reconstructed at `apps/backend/package.json`. Write it:

```bash
cat > apps/backend/package.json <<'EOF'
{
  "name": "@tabularis/registry-backend",
  "version": "0.0.0",
  "private": true,
  "module": "src/index.ts",
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "start": "bun src/index.ts",
    "build": "echo 'no build step — Bun runs TS directly'",
    "test": "bun test",
    "seed": "bun src/db/seed.ts",
    "migrate": "bunx drizzle-kit migrate",
    "generate": "bunx drizzle-kit generate"
  },
  "devDependencies": {
    "@tabularis/tsconfig": "workspace:*",
    "drizzle-kit": "^0.31.10"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "@elysiajs/openapi": "^1.4.5",
    "@elysiajs/static": "^1.4.10",
    "arctic": "^3.7.0",
    "drizzle-orm": "^0.45.2",
    "elysia": "^1.4.28",
    "elysia-file-router": "file:../../../vendor/elysia-file-router/elysia-file-router-0.0.1.tgz",
    "jose": "^6.2.3"
  }
}
EOF
```

Two notable diffs vs the old backend `package.json`:
- The `name` is now `@tabularis/registry-backend` and the workspace adds `@tabularis/tsconfig`.
- The vendored tarball path moves from absolute (`file:/home/newt/.../elysia-file-router-0.0.1.tgz`) to relative (`file:../../../vendor/elysia-file-router/elysia-file-router-0.0.1.tgz`). The relative path from `apps/backend/` to `/home/newt/Projekte/Personal/TabularisDB/vendor/elysia-file-router/...` is `../../../vendor/...` — verify by running `ls ../../vendor/elysia-file-router/elysia-file-router-0.0.1.tgz` from inside `apps/backend/` after `cd`. If the file is missing, regenerate it: `cd /home/newt/Projekte/Personal/TabularisDB/vendor/elysia-file-router && bun pm pack`.
- `@elysiajs/openapi` is added now so a single `bun install` in Task 3 covers everything.

- [ ] **Step 6: Update `apps/backend/tsconfig.json` to extend the shared base**

```bash
cat > apps/backend/tsconfig.json <<'EOF'
{
  "extends": "@tabularis/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests"]
}
EOF
```

- [ ] **Step 7: Verify nothing was accidentally orphaned at the root**

```bash
ls
# Expected: apps  bun.lock  CLAUDE.md  docs  node_modules  package.json  packages  turbo.json
# (and possibly: .git, .env, .gitignore, .claude — these are fine)
```

The old `node_modules` at the root is now stale and contained the backend's installs. That's fine; Task 3 reinstalls everything in the right places.

- [ ] **Step 8: Commit the move**

```bash
git add -A
git status
# Expected: every src/, tests/, etc. shows as renamed → apps/backend/...
git commit -m "chore: move backend sources into apps/backend"
```

---

## Task 3: Install workspaces and verify tests still pass

**Files:**
- Modify: `bun.lock` (regenerated)

- [ ] **Step 1: Remove the stale root `node_modules`**

```bash
rm -rf node_modules
```

The old layout's `node_modules` is no longer correct for the workspace setup.

- [ ] **Step 2: Install at the monorepo root**

```bash
bun install
```

Expected output near the end: a count of packages installed plus links for the workspace deps (you should see `@tabularis/registry-backend` and `@tabularis/tsconfig` mentioned). No errors.

- [ ] **Step 3: Verify the backend tests still pass from the new location**

```bash
bun --cwd apps/backend test
```

Expected: `55 pass, 0 fail`. If anything fails, stop. The most likely failure mode is a path issue inside `apps/backend/tests/setup.ts` or `drizzle.config.ts`; both use paths relative to cwd, and cwd here is `apps/backend/`, so they should still work.

- [ ] **Step 4: Verify the live server starts and serves seeded data**

```bash
rm -f apps/backend/data/registry.db
mkdir -p apps/backend/data
bun --cwd apps/backend run seed
# Expected: "Seeded 8 plugins and 11 releases."

bun --cwd apps/backend src/index.ts > /tmp/reg-task3.log 2>&1 &
SP=$!
sleep 2
curl -s http://localhost:3000/api/plugins | head -c 100
echo
kill $SP 2>/dev/null
head -3 /tmp/reg-task3.log
```

Expected: `/api/plugins` returns JSON starting with `{"total":8`. Log shows `Registry running on http://localhost:3000`.

- [ ] **Step 5: Commit the lockfile (path changes)**

```bash
git add bun.lock
git commit -m "chore: regenerate lockfile after workspace move"
```

---

## Task 4: Refactor route handler paths to relative

**Files:**
- Modify: `apps/backend/src/routes/auth/me.ts`
- Modify: `apps/backend/src/routes/auth/[provider]/index.ts`
- Modify: `apps/backend/src/routes/auth/[provider]/callback.ts`
- Modify: `apps/backend/src/routes/api/plugins/index.ts`
- Modify: `apps/backend/src/routes/api/plugins/[slug]/index.ts`
- Modify: `apps/backend/src/routes/api/plugins/[slug]/latest.ts`
- Modify: `apps/backend/src/routes/api/submit/oauth.ts`
- Modify: `apps/backend/src/routes/api/submit/challenge/index.ts`
- Modify: `apps/backend/src/routes/api/submit/challenge/verify.ts`
- Modify: `apps/backend/src/routes/api/webhooks/release.ts`
- Modify: `apps/backend/src/routes/api/requests/index.ts`
- Modify: `apps/backend/src/routes/api/requests/[id]/upvote.ts`

The file-router auto-prefixes each route by the directory path (replacing `[param]` with `:param`). Each handler must declare its path **relative** to that prefix. For most files, that means `/`; for `auth/[provider]/callback.ts` and `api/plugins/[slug]/latest.ts` and `api/requests/[id]/upvote.ts`, also `/` (the file name itself becomes a prefix segment).

After this task, the tests will fail because they currently mount one route at a time without prefixes. Task 5 fixes the tests; do not commit until Task 5 passes.

- [ ] **Step 1: Change `apps/backend/src/routes/auth/me.ts`**

Find:
```typescript
  .get('/auth/me', ({ user }) => ({
```

Replace with:
```typescript
  .get('/', ({ user }) => ({
```

- [ ] **Step 2: Change `apps/backend/src/routes/auth/[provider]/index.ts`**

Find:
```typescript
  .get('/auth/:provider', async ({ params, query, set, cookie, redirect }) => {
```
(or whatever the existing line is — the path is `/auth/:provider`)

Replace path with `/`:
```typescript
  .get('/', async ({ params, query, set, cookie, redirect }) => {
```

- [ ] **Step 3: Change `apps/backend/src/routes/auth/[provider]/callback.ts`**

Find:
```typescript
  .get('/auth/:provider/callback', async ({ params, query, cookie, set, redirect }) => {
```

Replace path with `/`:
```typescript
  .get('/', async ({ params, query, cookie, set, redirect }) => {
```

- [ ] **Step 4: Change `apps/backend/src/routes/api/plugins/index.ts`**

Find:
```typescript
  .get('/api/plugins', async ({ query }) => {
```

Replace with:
```typescript
  .get('/', async ({ query }) => {
```

- [ ] **Step 5: Change `apps/backend/src/routes/api/plugins/[slug]/index.ts`**

Find:
```typescript
  .get('/api/plugins/:slug', async ({ params, set }) => {
```

Replace with:
```typescript
  .get('/', async ({ params, set }) => {
```

- [ ] **Step 6: Change `apps/backend/src/routes/api/plugins/[slug]/latest.ts`**

Find:
```typescript
  .get('/api/plugins/:slug/latest', async ({ params, query, set }) => {
```

Replace with:
```typescript
  .get('/', async ({ params, query, set }) => {
```

- [ ] **Step 7: Change `apps/backend/src/routes/api/submit/oauth.ts`**

Find:
```typescript
  .post('/api/submit/oauth', async ({ user, body, set }) => {
```

Replace with:
```typescript
  .post('/', async ({ user, body, set }) => {
```

- [ ] **Step 8: Change `apps/backend/src/routes/api/submit/challenge/index.ts`**

Find:
```typescript
  .post('/api/submit/challenge', async ({ body }) => {
```

Replace with:
```typescript
  .post('/', async ({ body }) => {
```

- [ ] **Step 9: Change `apps/backend/src/routes/api/submit/challenge/verify.ts`**

Find:
```typescript
  .post('/api/submit/challenge/verify', async ({ user, query, body, set }) => {
```

Replace with:
```typescript
  .post('/', async ({ user, query, body, set }) => {
```

- [ ] **Step 10: Change `apps/backend/src/routes/api/webhooks/release.ts`**

Find:
```typescript
  .post('/api/webhooks/release', async ({ request, set }) => {
```

Replace with:
```typescript
  .post('/', async ({ request, set }) => {
```

- [ ] **Step 11: Change `apps/backend/src/routes/api/requests/index.ts`**

Both the GET and POST in this file need updates. Find:
```typescript
  .get('/api/requests', async ({ query }) => {
```

Replace with:
```typescript
  .get('/', async ({ query }) => {
```

Find:
```typescript
  .post('/api/requests', async ({ user, body, set }) => {
```

Replace with:
```typescript
  .post('/', async ({ user, body, set }) => {
```

- [ ] **Step 12: Change `apps/backend/src/routes/api/requests/[id]/upvote.ts`**

Find:
```typescript
  .post('/api/requests/:id/upvote', async ({ user, params, set }) => {
```

Replace with:
```typescript
  .post('/', async ({ user, params, set }) => {
```

- [ ] **Step 13: Confirm tests now fail (expected red phase)**

```bash
bun --cwd apps/backend test 2>&1 | tail -5
```

Expected: many failures with 404 status or "Cannot find" type messages. **Do not commit until Task 5 makes them green again.**

---

## Task 5: Update tests to use a shared `buildApp()` helper

**Files:**
- Modify: `apps/backend/tests/helpers.ts`
- Modify: `apps/backend/tests/routes/plugins.test.ts`
- Modify: `apps/backend/tests/routes/auth.test.ts`
- Modify: `apps/backend/tests/routes/submit.test.ts`
- Modify: `apps/backend/tests/routes/webhooks.test.ts`
- Modify: `apps/backend/tests/routes/requests.test.ts`

- [ ] **Step 1: Add `buildApp()` to `apps/backend/tests/helpers.ts`**

At the bottom of the file, append:

```typescript
import { Elysia } from 'elysia'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'

let cachedApp: Elysia | null = null

export async function buildApp() {
  if (cachedApp) return cachedApp
  cachedApp = new Elysia({ systemRouter: false }).use(
    await fileRouter({
      dir: resolve(import.meta.dir, '../src/routes'),
      types: false,
      logLevel: 'silent',
    }),
  )
  return cachedApp
}
```

The cache is intentional: `fileRouter()` does a filesystem scan and imports all routes; we only need that once per test process. State isolation across tests is preserved by `clearDb()` (already called in `beforeEach`), not by rebuilding the app.

Make sure the existing imports at the top of the file still cover `db`, `schema`, etc. The new imports above are scoped to the new helper.

- [ ] **Step 2: Update `apps/backend/tests/routes/plugins.test.ts`**

Remove the local `buildApp()` definition. Replace the import line:
```typescript
import { clearDb, makeUser, makePlugin } from '../helpers'
```
with:
```typescript
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
```

Delete the local `async function buildApp() { ... }` block.

- [ ] **Step 3: Update `apps/backend/tests/routes/auth.test.ts`**

Replace the import line:
```typescript
import { clearDb, makeUser } from '../helpers'
```
with:
```typescript
import { clearDb, makeUser, buildApp } from '../helpers'
```

For each test that locally does `new Elysia().use(authStart)` etc., replace with `const app = await buildApp()`. Concretely, every test that has:
```typescript
const { default: authStart } = await import('../../src/routes/auth/[provider]/index')
const app = new Elysia().use(authStart)
```
becomes:
```typescript
const app = await buildApp()
```
(remove the `const { default: ...} = await import(...)` lines entirely — `buildApp()` mounts every route).

The same substitution applies to all locally-mounted route variations in this file.

- [ ] **Step 4: Update `apps/backend/tests/routes/submit.test.ts`**

Replace the import line to add `buildApp`:
```typescript
import { clearDb, makeUser, buildApp } from '../helpers'
```

Delete the local `async function buildSubmitApp() { ... }` and `async function buildChallengeApp() { ... }` definitions.

Replace every `await buildSubmitApp()` and `await buildChallengeApp()` with `await buildApp()`.

- [ ] **Step 5: Update `apps/backend/tests/routes/webhooks.test.ts`**

Replace the import to add `buildApp`:
```typescript
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
```

Delete the local `async function buildWebhookApp() { ... }`. Replace every `await buildWebhookApp()` with `await buildApp()`.

- [ ] **Step 6: Update `apps/backend/tests/routes/requests.test.ts`**

Replace the import to add `buildApp`:
```typescript
import { clearDb, makeUser, buildApp } from '../helpers'
```

Delete the local `async function buildRequestsApp() { ... }`. Replace every `await buildRequestsApp()` with `await buildApp()`.

- [ ] **Step 7: Run the full test suite**

```bash
bun --cwd apps/backend test
```

Expected: `55 pass, 0 fail`. If anything fails, read the message carefully — the most likely cause is a leftover local `buildXxxApp` reference. Find and replace.

- [ ] **Step 8: Commit the route refactor + test update together**

```bash
git add apps/backend/src/routes apps/backend/tests
git commit -m "refactor: switch route handlers to relative paths for file-router"
```

---

## Task 6: Restore fileRouter and remove the flat loader in src/index.ts

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Rewrite `apps/backend/src/index.ts`**

```bash
cat > apps/backend/src/index.ts <<'EOF'
import { Elysia } from 'elysia'
import staticPlugin from '@elysiajs/static'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'

const app = new Elysia({ systemRouter: false })
  .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/' }))
  .use(await fileRouter({ dir: resolve('./src/routes'), types: false }))
  .listen(Number(Bun.env.PORT ?? 3000))

console.log(`Registry running on http://localhost:${app.server?.port}`)

export type App = typeof app
EOF
```

Two changes from the current state:
- The `loadRoutes()` helper and its caller are gone — `fileRouter()` is the single source of routes.
- The static plugin path is now `../frontend/dist` (relative to `apps/backend/`).

The OpenAPI plugin is added in Task 7 — keep this commit focused on file-router.

- [ ] **Step 2: Confirm tests still pass (sanity)**

```bash
bun --cwd apps/backend test
```

Expected: `55 pass, 0 fail`. Tests don't import `src/index.ts`, so this should be unchanged from Task 5 — but verify.

- [ ] **Step 3: Live smoke test**

```bash
bun --cwd apps/backend src/index.ts > /tmp/reg-task6.log 2>&1 &
SP=$!
sleep 2
echo "=== /api/plugins ==="
curl -s http://localhost:3000/api/plugins | head -c 200
echo
echo "=== /api/plugins/duckdb/latest?os=linux&arch=x64 ==="
curl -s "http://localhost:3000/api/plugins/duckdb/latest?os=linux&arch=x64"
echo
echo "=== /auth/github (expect 302) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/auth/github
kill $SP 2>/dev/null
```

Expected:
- `/api/plugins` → JSON with `"total":8`
- `/api/plugins/duckdb/latest?os=linux&arch=x64` → JSON with `version`, `download_url`
- `/auth/github` → `HTTP 302`

If any of these fail, the relative-path refactor in Task 4 missed a file or the file-router is mounting at an unexpected path. Stop and inspect.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat: restore elysia-file-router in app entry"
```

---

## Task 7: Add @elysiajs/openapi plugin

**Files:**
- Modify: `apps/backend/src/index.ts`

The `@elysiajs/openapi` package is already in `apps/backend/package.json` from Task 2. This task only wires it in.

- [ ] **Step 1: Update `apps/backend/src/index.ts` to mount the OpenAPI plugin**

```bash
cat > apps/backend/src/index.ts <<'EOF'
import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'
import staticPlugin from '@elysiajs/static'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'

const app = new Elysia({ systemRouter: false })
  .use(
    openapi({
      documentation: {
        info: {
          title: 'Tabularis Plugin Registry API',
          version: '1.0.0',
          description: 'Index, submit, and discover plugins for the Tabularis app.',
        },
        servers: [
          { url: 'http://localhost:3000', description: 'Local dev' },
          { url: 'https://registry.tabularis.dev', description: 'Production' },
        ],
        tags: [
          { name: 'Plugins', description: 'List, search, and inspect plugins' },
          { name: 'Auth', description: 'OAuth login with GitHub or Gitea/Forgejo' },
          { name: 'Submit', description: 'Submit a new plugin' },
          { name: 'Webhooks', description: 'Release sync from GitHub/Gitea' },
          { name: 'Requests', description: 'Community plugin wish list' },
        ],
      },
    }),
  )
  .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/' }))
  .use(await fileRouter({ dir: resolve('./src/routes'), types: false }))
  .onError(({ code, path, set }) => {
    if (code === 'NOT_FOUND' && !path.startsWith('/api') && !path.startsWith('/auth') && !path.startsWith('/openapi')) {
      set.headers['content-type'] = 'text/html; charset=utf-8'
      return Bun.file(resolve('../frontend/dist/index.html'))
    }
  })
  .listen(Number(Bun.env.PORT ?? 3000))

console.log(`Registry running on http://localhost:${app.server?.port}`)
console.log(`OpenAPI spec: http://localhost:${app.server?.port}/openapi/json`)
console.log(`OpenAPI UI:   http://localhost:${app.server?.port}/openapi`)

export type App = typeof app
EOF
```

Two additions vs Task 6:
- The `openapi(...)` plugin is mounted first so it can introspect the rest of the routes.
- An `onError` handler converts any non-API 404 into the SPA shell (`frontend/dist/index.html`). It returns `undefined` for 404s on `/api/*`, `/auth/*`, and `/openapi/*`, which lets Elysia fall back to its default JSON 404.

- [ ] **Step 2: Live smoke test**

```bash
bun --cwd apps/backend src/index.ts > /tmp/reg-task7.log 2>&1 &
SP=$!
sleep 2
echo "=== /openapi/json (first 300 chars) ==="
curl -s http://localhost:3000/openapi/json | head -c 300
echo
echo "=== /openapi (Scalar UI, expect HTML) ==="
curl -s -o /dev/null -w "HTTP %{http_code} content-type=%{content_type}\n" http://localhost:3000/openapi
echo "=== /api/plugins (sanity) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/plugins
kill $SP 2>/dev/null
```

Expected:
- `/openapi/json` → JSON starting with `{"openapi":"3.` (the spec)
- `/openapi` → HTTP 200 with `content-type=text/html...`
- `/api/plugins` → HTTP 200

If `/openapi/json` 404s, the plugin name is wrong — verify by reading `apps/backend/node_modules/@elysiajs/openapi/package.json` for the exported name. If the Scalar UI doesn't render, the path may be `/openapi` vs `/openapi/scalar` depending on plugin version.

- [ ] **Step 3: Run tests (sanity)**

```bash
bun --cwd apps/backend test
```

Expected: `55 pass`. OpenAPI introspection doesn't affect runtime behavior of routes.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat: add @elysiajs/openapi plugin with Scalar UI and SPA fallback"
```

---

## Task 8: Tag each route group for OpenAPI

**Files:**
- Modify: `apps/backend/src/routes/auth/me.ts`
- Modify: `apps/backend/src/routes/auth/[provider]/index.ts`
- Modify: `apps/backend/src/routes/auth/[provider]/callback.ts`
- Modify: `apps/backend/src/routes/api/plugins/index.ts`
- Modify: `apps/backend/src/routes/api/plugins/[slug]/index.ts`
- Modify: `apps/backend/src/routes/api/plugins/[slug]/latest.ts`
- Modify: `apps/backend/src/routes/api/submit/oauth.ts`
- Modify: `apps/backend/src/routes/api/submit/challenge/index.ts`
- Modify: `apps/backend/src/routes/api/submit/challenge/verify.ts`
- Modify: `apps/backend/src/routes/api/webhooks/release.ts`
- Modify: `apps/backend/src/routes/api/requests/index.ts`
- Modify: `apps/backend/src/routes/api/requests/[id]/upvote.ts`

Every route's options object (the second argument to `.get()` / `.post()`) gets `detail: { tags: ['<group>'] }`. If a route currently passes no options object (just a handler), add one with only `detail`.

The tag mapping by file:

| File | Tag |
|---|---|
| `auth/me.ts` | `Auth` |
| `auth/[provider]/index.ts` | `Auth` |
| `auth/[provider]/callback.ts` | `Auth` |
| `api/plugins/index.ts` | `Plugins` |
| `api/plugins/[slug]/index.ts` | `Plugins` |
| `api/plugins/[slug]/latest.ts` | `Plugins` |
| `api/submit/oauth.ts` | `Submit` |
| `api/submit/challenge/index.ts` | `Submit` |
| `api/submit/challenge/verify.ts` | `Submit` |
| `api/webhooks/release.ts` | `Webhooks` |
| `api/requests/index.ts` | `Requests` (both GET and POST) |
| `api/requests/[id]/upvote.ts` | `Requests` |

- [ ] **Step 1: Update `apps/backend/src/routes/api/plugins/index.ts`**

Find the existing options object:
```typescript
  }, {
    query: t.Object({
      search: t.Optional(t.String()),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Plugins'] },
    query: t.Object({
      search: t.Optional(t.String()),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
  })
```

- [ ] **Step 2: Update `apps/backend/src/routes/api/plugins/[slug]/index.ts`**

The current code is:
```typescript
  .get('/', async ({ params, set }) => {
    /* ... */
  })
```
(no options object)

Replace the closing of the `.get(...)` call to include an options object:
```typescript
  .get('/', async ({ params, set }) => {
    /* ... */
  }, {
    detail: { tags: ['Plugins'] },
  })
```

- [ ] **Step 3: Update `apps/backend/src/routes/api/plugins/[slug]/latest.ts`**

Find the options object at the end of the `.get()`:
```typescript
  }, {
    query: t.Object({
      os: t.String(),
      arch: t.String(),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Plugins'] },
    query: t.Object({
      os: t.String(),
      arch: t.String(),
    }),
  })
```

- [ ] **Step 4: Update `apps/backend/src/routes/auth/me.ts`**

The current code is:
```typescript
  .get('/', ({ user }) => ({
    id: user.sub,
    username: user.username,
    provider: user.provider,
    providerInstanceUrl: user.providerInstanceUrl,
  }))
```

Replace with:
```typescript
  .get('/', ({ user }) => ({
    id: user.sub,
    username: user.username,
    provider: user.provider,
    providerInstanceUrl: user.providerInstanceUrl,
  }), {
    detail: { tags: ['Auth'] },
  })
```

- [ ] **Step 5: Update `apps/backend/src/routes/auth/[provider]/index.ts`**

Find the options object at the end of the `.get()`:
```typescript
  }, {
    query: t.Object({
      instance: t.Optional(t.String()),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Auth'] },
    query: t.Object({
      instance: t.Optional(t.String()),
    }),
  })
```

- [ ] **Step 6: Update `apps/backend/src/routes/auth/[provider]/callback.ts`**

Find the options object:
```typescript
  }, {
    query: t.Object({
      code: t.String(),
      state: t.String(),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Auth'] },
    query: t.Object({
      code: t.String(),
      state: t.String(),
    }),
  })
```

- [ ] **Step 7: Update `apps/backend/src/routes/api/submit/oauth.ts`**

Find the options object:
```typescript
  }, {
    body: t.Object({
      repoUrl: t.String(),
      name: t.String(),
      description: t.String(),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Submit'] },
    body: t.Object({
      repoUrl: t.String(),
      name: t.String(),
      description: t.String(),
    }),
  })
```

- [ ] **Step 8: Update `apps/backend/src/routes/api/submit/challenge/index.ts`**

Find:
```typescript
  }, {
    body: t.Object({ repoUrl: t.String() }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Submit'] },
    body: t.Object({ repoUrl: t.String() }),
  })
```

- [ ] **Step 9: Update `apps/backend/src/routes/api/submit/challenge/verify.ts`**

Find:
```typescript
  }, {
    query: t.Object({ token: t.String() }),
    body: t.Object({
      name: t.String(),
      description: t.String(),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Submit'] },
    query: t.Object({ token: t.String() }),
    body: t.Object({
      name: t.String(),
      description: t.String(),
    }),
  })
```

- [ ] **Step 10: Update `apps/backend/src/routes/api/webhooks/release.ts`**

The current code ends with:
```typescript
  .post('/', async ({ request, set }) => {
    /* ... */
  })
```
(no options object)

Replace the closing of the `.post()`:
```typescript
  .post('/', async ({ request, set }) => {
    /* ... */
  }, {
    detail: { tags: ['Webhooks'] },
  })
```

- [ ] **Step 11: Update `apps/backend/src/routes/api/requests/index.ts`**

There are two handlers in this file (GET and POST), so two options objects to edit.

GET options:
```typescript
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      sort: t.Optional(t.Union([t.Literal('upvotes'), t.Literal('recent')])),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Requests'] },
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      sort: t.Optional(t.Union([t.Literal('upvotes'), t.Literal('recent')])),
    }),
  })
```

POST options:
```typescript
  }, {
    body: t.Object({
      slug: t.String({ pattern: '^[a-z0-9-]+$' }),
      name: t.String(),
      description: t.String(),
    }),
  })
```

Replace with:
```typescript
  }, {
    detail: { tags: ['Requests'] },
    body: t.Object({
      slug: t.String({ pattern: '^[a-z0-9-]+$' }),
      name: t.String(),
      description: t.String(),
    }),
  })
```

- [ ] **Step 12: Update `apps/backend/src/routes/api/requests/[id]/upvote.ts`**

The current code ends with `})` (no options object):
```typescript
  .post('/', async ({ user, params, set }) => {
    /* ... */
  })
```

Replace with:
```typescript
  .post('/', async ({ user, params, set }) => {
    /* ... */
  }, {
    detail: { tags: ['Requests'] },
  })
```

- [ ] **Step 13: Run tests**

```bash
bun --cwd apps/backend test
```

Expected: `55 pass`. Adding `detail.tags` is type-system-only metadata and does not change route runtime behavior.

- [ ] **Step 14: Verify the spec now includes tags**

```bash
bun --cwd apps/backend src/index.ts > /tmp/reg-task8.log 2>&1 &
SP=$!
sleep 2
curl -s http://localhost:3000/openapi/json | grep -o '"tags":\[[^]]*\]' | head -5
kill $SP 2>/dev/null
```

Expected: lines like `"tags":["Plugins"]`, `"tags":["Auth"]`, etc. — at least 5 hits.

- [ ] **Step 15: Commit**

```bash
git add apps/backend/src/routes
git commit -m "feat: tag routes for OpenAPI grouping"
```

---

## Task 9: Add response schemas to JSON-returning routes

**Files:**
- Modify: `apps/backend/src/routes/api/plugins/index.ts`
- Modify: `apps/backend/src/routes/api/plugins/[slug]/index.ts`
- Modify: `apps/backend/src/routes/api/plugins/[slug]/latest.ts`
- Modify: `apps/backend/src/routes/auth/me.ts`
- Modify: `apps/backend/src/routes/api/requests/index.ts`

Routes that return raw responses (the auth start/callback that redirect, the webhook that returns plain `{ok}`/`{skipped}`) skip this — only the routes that return structured JSON consumed by the frontend get explicit response schemas. This also keeps the diff focused.

For the schema definitions: each route file declares a local `t.Object(...)` describing the success shape. The success response is wired in under `response: { 200: schemaName }`. Error responses (404, 422, 409 etc.) are NOT added to the schema in this task — they would require typed unions and the routes currently return a plain `{ error: string }` shape that's the same across statuses. If needed later, add a single shared `errorResponseSchema = t.Object({ error: t.String() })` and reference it for `404`, `409`, `422`.

- [ ] **Step 1: Add response schema to `apps/backend/src/routes/api/plugins/index.ts`**

At the top of the file, after the existing imports, add:
```typescript
const releaseSchema = t.Object({
  id: t.String(),
  pluginId: t.String(),
  version: t.String(),
  minTabularisVersion: t.Nullable(t.String()),
  assets: t.Record(t.String(), t.String()),
  createdAt: t.Number(),
})

const pluginSummarySchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  name: t.String(),
  description: t.String(),
  author: t.String(),
  repoUrl: t.String(),
  homepage: t.String(),
  latestVersion: t.Nullable(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
  releases: t.Array(releaseSchema),
})

const pluginListResponseSchema = t.Object({
  total: t.Number(),
  page: t.Number(),
  limit: t.Number(),
  plugins: t.Array(pluginSummarySchema),
})
```

Update the options object to reference the schema:
```typescript
  }, {
    detail: { tags: ['Plugins'] },
    query: t.Object({
      search: t.Optional(t.String()),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
    response: { 200: pluginListResponseSchema },
  })
```

- [ ] **Step 2: Add response schema to `apps/backend/src/routes/api/plugins/[slug]/index.ts`**

After the imports, add:
```typescript
const releaseSchema = t.Object({
  id: t.String(),
  pluginId: t.String(),
  version: t.String(),
  minTabularisVersion: t.Nullable(t.String()),
  assets: t.Record(t.String(), t.String()),
  createdAt: t.Number(),
})

const pluginDetailSchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  name: t.String(),
  description: t.String(),
  author: t.String(),
  repoUrl: t.String(),
  homepage: t.String(),
  latestVersion: t.Nullable(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
  releases: t.Array(releaseSchema),
})

const errorSchema = t.Object({ error: t.String() })
```

Update the route options:
```typescript
  .get('/', async ({ params, set }) => {
    /* ... */
  }, {
    detail: { tags: ['Plugins'] },
    response: {
      200: pluginDetailSchema,
      404: errorSchema,
    },
  })
```

- [ ] **Step 3: Add response schema to `apps/backend/src/routes/api/plugins/[slug]/latest.ts`**

After the imports, add:
```typescript
const latestSuccessSchema = t.Object({
  version: t.String(),
  min_tabularis_version: t.Nullable(t.String()),
  download_url: t.String(),
})

const errorSchema = t.Object({ error: t.String() })
```

Update the route options:
```typescript
  }, {
    detail: { tags: ['Plugins'] },
    query: t.Object({
      os: t.String(),
      arch: t.String(),
    }),
    response: {
      200: latestSuccessSchema,
      404: errorSchema,
      422: errorSchema,
    },
  })
```

- [ ] **Step 4: Add response schema to `apps/backend/src/routes/auth/me.ts`**

The file currently has only `import { Elysia } from 'elysia'`. Replace that import with:
```typescript
import { Elysia, t } from 'elysia'
```

Add at the top of the file body:
```typescript
const meSchema = t.Object({
  id: t.String(),
  username: t.String(),
  provider: t.String(),
  providerInstanceUrl: t.Nullable(t.String()),
})
```

Update the route options:
```typescript
  .get('/', ({ user }) => ({
    id: user.sub,
    username: user.username,
    provider: user.provider,
    providerInstanceUrl: user.providerInstanceUrl,
  }), {
    detail: { tags: ['Auth'] },
    response: { 200: meSchema },
  })
```

- [ ] **Step 5: Add response schema to `apps/backend/src/routes/api/requests/index.ts`**

After the imports, add:
```typescript
const requestSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.String(),
  requesterId: t.String(),
  upvotes: t.Number(),
  createdAt: t.Number(),
})

const requestListResponseSchema = t.Object({
  total: t.Number(),
  page: t.Number(),
  limit: t.Number(),
  requests: t.Array(requestSchema),
})

const createRequestResponseSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.String(),
  requesterId: t.String(),
})

const errorSchema = t.Object({ error: t.String() })
```

Update the GET options:
```typescript
  }, {
    detail: { tags: ['Requests'] },
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      sort: t.Optional(t.Union([t.Literal('upvotes'), t.Literal('recent')])),
    }),
    response: { 200: requestListResponseSchema },
  })
```

Update the POST options:
```typescript
  }, {
    detail: { tags: ['Requests'] },
    body: t.Object({
      slug: t.String({ pattern: '^[a-z0-9-]+$' }),
      name: t.String(),
      description: t.String(),
    }),
    response: {
      200: createRequestResponseSchema,
      409: errorSchema,
    },
  })
```

- [ ] **Step 6: Run the full test suite**

```bash
bun --cwd apps/backend test
```

Expected: `55 pass, 0 fail`. If you see runtime validation errors here, the `response` schemas reject the actual shape returned by the handler — that means the handler returns extra fields or a different type. Inspect the test failure message to find the divergence and adjust the schema (it should match the handler's return, not a desired shape).

Two likely friction points:
- The `plugins/index.ts` and `[slug]/index.ts` handlers strip `webhookSecret` from the row but `releases.assets` is parsed from JSON string to an object. The schemas above reflect the post-strip, post-parse shape — verify the handlers do strip the secret before returning.
- The `me.ts` route's `provider` could be typed as `t.Union([t.Literal('github'), t.Literal('gitea')])`, but `t.String()` is simpler and aligned with what's in the JWT payload.

- [ ] **Step 7: Verify the spec includes the schemas**

```bash
bun --cwd apps/backend src/index.ts > /tmp/reg-task9.log 2>&1 &
SP=$!
sleep 2
curl -s http://localhost:3000/openapi/json | head -c 3000
kill $SP 2>/dev/null
```

Expected: the JSON output mentions `"schemas"` with definitions for the response types, and the route entries include `"responses": { "200": { ... } }` referencing them.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/routes
git commit -m "feat: add response schemas to JSON routes for OpenAPI"
```

---

## Task 10: Final verification

**Files:** (none — verification only)

- [ ] **Step 1: Run all tests one more time**

```bash
bun --cwd apps/backend test
```

Expected: `55 pass, 0 fail`.

- [ ] **Step 2: Live end-to-end smoke**

```bash
rm -f apps/backend/data/registry.db
bun --cwd apps/backend run seed
# Expected: "Seeded 8 plugins and 11 releases."

bun --cwd apps/backend src/index.ts > /tmp/reg-task10.log 2>&1 &
SP=$!
sleep 2

echo "=== /api/plugins total ==="
curl -s http://localhost:3000/api/plugins | jq '.total'
echo "=== plugin detail ==="
curl -s http://localhost:3000/api/plugins/duckdb | jq '{id, name, latestVersion, releaseCount: (.releases | length), hasSecret: has("webhookSecret")}'
echo "=== latest for linux-x64 ==="
curl -s "http://localhost:3000/api/plugins/duckdb/latest?os=linux&arch=x64" | jq '.version'
echo "=== /auth/github (expect 302) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/auth/github
echo "=== /openapi/json (count paths) ==="
curl -s http://localhost:3000/openapi/json | jq '.paths | keys | length'
echo "=== /openapi UI ==="
curl -s -o /dev/null -w "HTTP %{http_code} content-type=%{content_type}\n" http://localhost:3000/openapi
echo "=== SPA fallback (frontend not built, expect graceful behavior) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/some-spa-route

kill $SP 2>/dev/null
```

Expected:
- total = 8
- hasSecret = false
- linux-x64 version = `"0.2.0"`
- `/auth/github` = HTTP 302
- `/openapi/json` paths length ≥ 12 (one per route file)
- `/openapi` = HTTP 200, `content-type=text/html`
- SPA fallback returns either HTTP 200 (if `frontend/dist/index.html` exists from a previous run) or HTTP 500 because `Bun.file(missing)` errors. Either is acceptable in this plan — the frontend will be built in Plan B. If you see a 500 + log noise, that's fine for now.

- [ ] **Step 3: Run `git status` to confirm a clean tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. The state of the branch should now be a clean turborepo with all the OpenAPI surface in place.

- [ ] **Step 4: Print the commit graph**

```bash
git log --oneline -15
```

Expected: the last ~10 commits trace through Tasks 1-9.

---

## Notes for the engineer

- **You are working on an existing branch (`feat/registry-backend`).** Do not switch branches; commit on top.
- **The vendored router tarball lives at `/home/newt/Projekte/Personal/TabularisDB/vendor/elysia-file-router/elysia-file-router-0.0.1.tgz`.** If it is missing, regenerate it with `cd /home/newt/Projekte/Personal/TabularisDB/vendor/elysia-file-router && bun pm pack`.
- **`{ systemRouter: false }` is load-bearing.** Bun's native router does not handle duplicate parameter names across routes; this disables it. Do not remove the option.
- **The frontend is not part of this plan.** A separate plan ("Plan B") will scaffold `apps/frontend`. After this plan completes, the `../frontend/dist` static mount will silently fail to serve (it returns 404 for static files) — that's fine, all backend routes work without it.
- **DB migrations are unchanged.** They still live at `apps/backend/src/db/migrations/`. The in-memory `:memory:` DB used in tests gets migrated at `tests/setup.ts` preload.
