# Plugin Kinds Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-managed list of "kinds" (Themes, Snippets, SQL Templates, …) the registry exposes via strict-REST endpoints, plus `?kind=` filter and `facets.kinds` on the public plugin list. Plugin authors keep using `tags`; no DB-schema or manifest-schema change.

**Architecture:** Kinds live as a JSON array in `settings.plugin_kinds`. A single helper module (`lib/kinds.ts`) does *read-validate-write* on that setting and exposes create/read/update/delete operations + an `isKindKey` membership check. Two admin route files (collection + item) and one public route file map HTTP verbs onto those helpers. `/api/plugins` is edited to add a `kind` query param (validated against `isKindKey`) and a `facets.kinds` array (computed by re-scanning approved plugins' `tags`). `/api/manifest` gains a `kinds: string[]` field so manifest authors discover the active list.

**Tech Stack:** Bun + bun:test, Elysia (file-router, TypeBox `t.*` schemas), Drizzle ORM (`like`/`eq`/`and`), existing `lib/settings.ts` cache, `lib/audit.ts` recorder, `middleware/admin.ts`.

**Spec reference:** `docs/superpowers/specs/2026-05-14-plugin-kinds-design.md`.

---

## File Map

| Path | Purpose | Op |
|------|---------|----|
| `apps/backend/src/lib/kinds.ts` | Types, validator, read/mutate helpers backing every endpoint. | Create |
| `apps/backend/tests/lib/kinds.test.ts` | Unit tests for the lib helpers. | Create |
| `apps/backend/src/routes/api/kinds/index.ts` | Public `GET /api/kinds`. | Create |
| `apps/backend/src/routes/api/admin/kinds/index.ts` | Admin `GET /api/admin/kinds` and `POST /api/admin/kinds`. | Create |
| `apps/backend/src/routes/api/admin/kinds/[key].ts` | Admin `GET /:key`, `PUT /:key`, `DELETE /:key`. | Create |
| `apps/backend/tests/routes/kinds.test.ts` | Route tests for public + admin kinds endpoints. | Create |
| `apps/backend/src/routes/api/plugins/index.ts` | Add `kind` query param + `facets.kinds`. | Modify |
| `apps/backend/tests/routes/plugins.test.ts` | Add cases for `?kind=` + `facets.kinds`. | Modify |
| `apps/backend/src/routes/api/manifest/index.ts` | Add `kinds: string[]` to response, update example. | Modify |
| `apps/backend/tests/routes/manifest.test.ts` | Cover new response field. | Create |

`signJwt` for admin-auth in tests works the same as in `tests/routes/requests.test.ts` — sign a JWT for a user with `role: 'admin'`.

---

## Task 1: `lib/kinds.ts` — types, validator, reads

**Files:**
- Create: `apps/backend/src/lib/kinds.ts`
- Create: `apps/backend/tests/lib/kinds.test.ts`

- [ ] **Step 1: Write failing tests for `validateKindDef` and reads**

Create `apps/backend/tests/lib/kinds.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import {
  validateKindDef,
  getKinds,
  getKind,
  isKindKey,
  KindError,
} from '../../src/lib/kinds'

describe('validateKindDef', () => {
  it('accepts minimal valid input', () => {
    const out = validateKindDef({ key: 'theme', label: 'Themes' })
    expect(out).toEqual({ key: 'theme', label: 'Themes', description: null })
  })

  it('accepts description as string or null', () => {
    expect(validateKindDef({ key: 'a', label: 'A', description: 'd' }).description).toBe('d')
    expect(validateKindDef({ key: 'a', label: 'A', description: null }).description).toBeNull()
  })

  it('rejects non-slug key', () => {
    expect(() => validateKindDef({ key: 'Bad Key!', label: 'X' })).toThrow(KindError)
  })

  it('rejects empty label', () => {
    expect(() => validateKindDef({ key: 'ok', label: '' })).toThrow(KindError)
  })

  it('rejects oversized fields', () => {
    expect(() => validateKindDef({ key: 'k', label: 'L'.repeat(61) })).toThrow(KindError)
    expect(() => validateKindDef({ key: 'k', label: 'L', description: 'd'.repeat(281) })).toThrow(KindError)
  })

  it('rejects non-object input', () => {
    expect(() => validateKindDef(null)).toThrow(KindError)
    expect(() => validateKindDef('theme')).toThrow(KindError)
  })
})

describe('reads', () => {
  beforeEach(clearDb)

  it('getKinds returns [] when unset', () => {
    expect(getKinds()).toEqual([])
  })

  it('getKinds returns [] when setting is malformed JSON', async () => {
    await setSetting('plugin_kinds', 'not json')
    expect(getKinds()).toEqual([])
  })

  it('getKind returns the matching def or null', async () => {
    await setSetting('plugin_kinds', JSON.stringify([
      { key: 'theme', label: 'Themes', description: null },
    ]))
    expect(getKind('theme')?.label).toBe('Themes')
    expect(getKind('nope')).toBeNull()
  })

  it('isKindKey matches active keys', async () => {
    await setSetting('plugin_kinds', JSON.stringify([
      { key: 'theme', label: 'Themes', description: null },
    ]))
    expect(isKindKey('theme')).toBe(true)
    expect(isKindKey('snippet')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
cd apps/backend && bun test tests/lib/kinds.test.ts
```
Expected: FAIL — module `../../src/lib/kinds` not found.

- [ ] **Step 3: Implement the module (types + validator + reads only)**

Create `apps/backend/src/lib/kinds.ts`:

```ts
import { getSetting, setSetting } from './settings'

export type KindDef = {
  key: string
  label: string
  description: string | null
}

export type KindErrorCode = 'invalid' | 'duplicate' | 'not_found'

export class KindError extends Error {
  constructor(public code: KindErrorCode, message: string) {
    super(message)
    this.name = 'KindError'
  }
}

const SETTINGS_KEY = 'plugin_kinds'
const MAX_ENTRIES = 64
const KEY_RE = /^[a-z0-9][a-z0-9-]*$/
const KEY_MAX = 40
const LABEL_MAX = 60
const DESC_MAX = 280

export function validateKindDef(input: unknown): KindDef {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new KindError('invalid', 'kind definition must be an object')
  }
  const o = input as Record<string, unknown>
  const key = typeof o.key === 'string' ? o.key.trim() : ''
  const label = typeof o.label === 'string' ? o.label.trim() : ''
  const descRaw = o.description
  if (!key || key.length > KEY_MAX || !KEY_RE.test(key)) {
    throw new KindError('invalid', `key must match ${KEY_RE} (max ${KEY_MAX} chars)`)
  }
  if (!label || label.length > LABEL_MAX) {
    throw new KindError('invalid', `label must be 1..${LABEL_MAX} chars`)
  }
  let description: string | null
  if (descRaw === undefined || descRaw === null || descRaw === '') {
    description = null
  } else if (typeof descRaw !== 'string') {
    throw new KindError('invalid', 'description must be string or null')
  } else if (descRaw.length > DESC_MAX) {
    throw new KindError('invalid', `description max ${DESC_MAX} chars`)
  } else {
    description = descRaw
  }
  return { key, label, description }
}

export function getKinds(): KindDef[] {
  const raw = getSetting(SETTINGS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        try { return validateKindDef(item) } catch { return null }
      })
      .filter((x): x is KindDef => x !== null)
  } catch {
    return []
  }
}

export function getKind(key: string): KindDef | null {
  return getKinds().find((k) => k.key === key) ?? null
}

export function isKindKey(key: string): boolean {
  return getKinds().some((k) => k.key === key)
}

async function writeKinds(next: KindDef[]): Promise<void> {
  if (next.length > MAX_ENTRIES) {
    throw new KindError('invalid', `at most ${MAX_ENTRIES} kinds allowed`)
  }
  await setSetting(SETTINGS_KEY, JSON.stringify(next))
}

export async function createKind(def: KindDef): Promise<KindDef> {
  const v = validateKindDef(def)
  const current = getKinds()
  if (current.some((k) => k.key === v.key)) {
    throw new KindError('duplicate', `kind "${v.key}" already exists`)
  }
  await writeKinds([...current, v])
  return v
}

export async function updateKind(key: string, def: KindDef): Promise<KindDef> {
  const v = validateKindDef(def)
  if (v.key !== key) {
    throw new KindError('invalid', 'body key must match path key')
  }
  const current = getKinds()
  const idx = current.findIndex((k) => k.key === key)
  if (idx === -1) throw new KindError('not_found', `kind "${key}" not found`)
  const next = current.slice()
  next[idx] = v
  await writeKinds(next)
  return v
}

export async function deleteKind(key: string): Promise<void> {
  const current = getKinds()
  if (!current.some((k) => k.key === key)) {
    throw new KindError('not_found', `kind "${key}" not found`)
  }
  await writeKinds(current.filter((k) => k.key !== key))
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
cd apps/backend && bun test tests/lib/kinds.test.ts
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/kinds.ts apps/backend/tests/lib/kinds.test.ts
git commit -m "feat(backend): lib/kinds — kind registry helper (read + validate)"
```

---

## Task 2: `lib/kinds.ts` — mutator tests (create/update/delete)

**Files:**
- Modify: `apps/backend/tests/lib/kinds.test.ts`

The mutators are already implemented in Task 1; this task locks them down with tests. Splitting Task 1 keeps the first commit small.

- [ ] **Step 1: Append mutator tests**

Append to `apps/backend/tests/lib/kinds.test.ts`:

```ts
import { createKind, updateKind, deleteKind } from '../../src/lib/kinds'

describe('createKind', () => {
  beforeEach(clearDb)

  it('appends a new kind', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    expect(getKinds()).toEqual([{ key: 'theme', label: 'Themes', description: null }])
  })

  it('rejects duplicate key with KindError("duplicate")', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    try {
      await createKind({ key: 'theme', label: 'Other', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(KindError)
      expect((err as KindError).code).toBe('duplicate')
    }
  })

  it('enforces 64-entry cap', async () => {
    for (let i = 0; i < 64; i++) {
      await createKind({ key: `k${i}`, label: `K${i}`, description: null })
    }
    try {
      await createKind({ key: 'overflow', label: 'X', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('invalid')
    }
  })
})

describe('updateKind', () => {
  beforeEach(clearDb)

  it('replaces label/description for an existing key', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const updated = await updateKind('theme', { key: 'theme', label: 'Visual Themes', description: 'fancy' })
    expect(updated.label).toBe('Visual Themes')
    expect(getKind('theme')?.description).toBe('fancy')
  })

  it('rejects body key mismatch with KindError("invalid")', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    try {
      await updateKind('theme', { key: 'other', label: 'X', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('invalid')
    }
  })

  it('rejects unknown key with KindError("not_found")', async () => {
    try {
      await updateKind('nope', { key: 'nope', label: 'X', description: null })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('not_found')
    }
  })
})

describe('deleteKind', () => {
  beforeEach(clearDb)

  it('removes the entry', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await deleteKind('theme')
    expect(getKinds()).toEqual([])
  })

  it('second delete throws KindError("not_found")', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await deleteKind('theme')
    try {
      await deleteKind('theme')
      throw new Error('expected throw')
    } catch (err) {
      expect((err as KindError).code).toBe('not_found')
    }
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd apps/backend && bun test tests/lib/kinds.test.ts
```
Expected: all green (implementation from Task 1 covers these).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/tests/lib/kinds.test.ts
git commit -m "test(backend): lib/kinds — mutator coverage"
```

---

## Task 3: Public `GET /api/kinds`

**Files:**
- Create: `apps/backend/src/routes/api/kinds/index.ts`
- Create: `apps/backend/tests/routes/kinds.test.ts`

- [ ] **Step 1: Write failing test for the public catalog**

Create `apps/backend/tests/routes/kinds.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { createKind } from '../../src/lib/kinds'

describe('GET /api/kinds (public)', () => {
  beforeEach(clearDb)

  it('returns empty list on fresh install', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/kinds'))
    expect(res.status).toBe(200)
    const data = await res.json() as { kinds: unknown[] }
    expect(data.kinds).toEqual([])
  })

  it('returns admin-defined kinds', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/kinds'))
    const data = await res.json() as { kinds: Array<{ key: string; label: string }> }
    expect(data.kinds).toHaveLength(1)
    expect(data.kinds[0].key).toBe('theme')
  })
})
```

- [ ] **Step 2: Run test, confirm failure**

```bash
cd apps/backend && bun test tests/routes/kinds.test.ts
```
Expected: FAIL — 404 from the file router (route not yet defined).

- [ ] **Step 3: Implement the route**

Create `apps/backend/src/routes/api/kinds/index.ts`:

```ts
import { Elysia, t } from 'elysia'
import { getKinds } from '$lib/kinds'

const kindSchema = t.Object({
  key: t.String(),
  label: t.String(),
  description: t.Nullable(t.String()),
})

export default new Elysia()
  .get('/', () => ({ kinds: getKinds() }), {
    detail: {
      tags: ['Plugins'],
      summary: 'List active plugin kinds',
      description:
        'Returns the registry-wide list of plugin kinds defined by the admin. ' +
        'Plugin authors mark a plugin\'s kind by adding the matching value to their `tags` field. ' +
        'Public — no auth required.',
      operationId: 'listKinds',
    },
    response: { 200: t.Object({ kinds: t.Array(kindSchema) }) },
  })
```

- [ ] **Step 4: Run test, confirm pass**

```bash
cd apps/backend && bun test tests/routes/kinds.test.ts
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/api/kinds/index.ts apps/backend/tests/routes/kinds.test.ts
git commit -m "feat(backend): GET /api/kinds — public kind catalog"
```

---

## Task 4: Admin collection — `GET` + `POST /api/admin/kinds`

**Files:**
- Create: `apps/backend/src/routes/api/admin/kinds/index.ts`
- Modify: `apps/backend/tests/routes/kinds.test.ts`

- [ ] **Step 1: Append failing admin tests for GET/POST**

Append to `apps/backend/tests/routes/kinds.test.ts`:

```ts
import { signJwt } from '../../src/lib/jwt'
import { makeUser } from '../helpers'
import { db } from '../../src/db'
import { auditLog } from '../../src/db/schema'
import { eq } from 'drizzle-orm'

async function adminToken() {
  const u = await makeUser({ role: 'admin' })
  return signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
}

describe('GET /api/admin/kinds', () => {
  beforeEach(clearDb)

  it('401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds'))
    expect(res.status).toBe(401)
  })

  it('403 for non-admin', async () => {
    const u = await makeUser()
    const token = await signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(res.status).toBe(403)
  })

  it('200 with empty list for admin', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(res.status).toBe(200)
    const data = await res.json() as { kinds: unknown[] }
    expect(data.kinds).toEqual([])
  })
})

describe('POST /api/admin/kinds', () => {
  beforeEach(clearDb)

  it('creates a kind, returns 201 + Location header, writes audit', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'theme', label: 'Themes', description: null }),
    }))
    expect(res.status).toBe(201)
    expect(res.headers.get('Location')).toBe('/api/admin/kinds/theme')
    const data = await res.json() as { kind: { key: string } }
    expect(data.kind.key).toBe('theme')
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'kind.create'))
    expect(audits).toHaveLength(1)
    expect(audits[0].meta).toContain('"key":"theme"')
  })

  it('400 on invalid shape', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'Bad Key!', label: 'X' }),
    }))
    expect(res.status).toBe(400)
  })

  it('409 on duplicate key', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'theme', label: 'Other', description: null }),
    }))
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
cd apps/backend && bun test tests/routes/kinds.test.ts
```
Expected: FAIL — `/api/admin/kinds` not defined yet.

- [ ] **Step 3: Implement the admin collection route**

Create `apps/backend/src/routes/api/admin/kinds/index.ts`:

```ts
import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getKinds, createKind, KindError } from '$lib/kinds'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const kindBodySchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 40 }),
  label: t.String({ minLength: 1, maxLength: 60 }),
  description: t.Optional(t.Nullable(t.String({ maxLength: 280 }))),
})

const kindSchema = t.Object({
  key: t.String(),
  label: t.String(),
  description: t.Nullable(t.String()),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({ kinds: getKinds() }), {
    detail: {
      tags: ['Admin'],
      summary: 'List all plugin kinds',
      operationId: 'adminListKinds',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ kinds: t.Array(kindSchema) }) },
  })
  .post('/', async ({ body, set, admin, request }) => {
    try {
      const created = await createKind({
        key: body.key,
        label: body.label,
        description: body.description ?? null,
      })
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'kind.create',
        target: `kind:${created.key}`,
        meta: { key: created.key },
      })
      set.status = 201
      set.headers['Location'] = `/api/admin/kinds/${created.key}`
      return { kind: created }
    } catch (err) {
      if (err instanceof KindError) {
        set.status = err.code === 'duplicate' ? 409 : 400
        return { error: err.message }
      }
      throw err
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Create a plugin kind',
      operationId: 'adminCreateKind',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: kindBodySchema,
    response: {
      201: t.Object({ kind: kindSchema }),
      400: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && bun test tests/routes/kinds.test.ts
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/api/admin/kinds/index.ts apps/backend/tests/routes/kinds.test.ts
git commit -m "feat(backend): admin kinds collection — list + create"
```

---

## Task 5: Admin item — `GET` + `PUT` + `DELETE /api/admin/kinds/:key`

**Files:**
- Create: `apps/backend/src/routes/api/admin/kinds/[key].ts`
- Modify: `apps/backend/tests/routes/kinds.test.ts`

- [ ] **Step 1: Append failing tests for the item endpoints**

Append to `apps/backend/tests/routes/kinds.test.ts`:

```ts
describe('GET /api/admin/kinds/:key', () => {
  beforeEach(clearDb)

  it('200 with the kind', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds/theme', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(res.status).toBe(200)
    const data = await res.json() as { kind: { key: string } }
    expect(data.kind.key).toBe('theme')
  })

  it('404 for unknown key', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds/nope', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/admin/kinds/:key', () => {
  beforeEach(clearDb)

  it('replaces label, writes audit', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'theme', label: 'Visual Themes', description: 'd' }),
    }))
    expect(res.status).toBe(200)
    const data = await res.json() as { kind: { label: string } }
    expect(data.kind.label).toBe('Visual Themes')
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'kind.update'))
    expect(audits).toHaveLength(1)
  })

  it('409 when body key mismatches path', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'snippet', label: 'X', description: null }),
    }))
    expect(res.status).toBe(409)
  })

  it('404 for unknown key', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds/nope', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'nope', label: 'X', description: null }),
    }))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/admin/kinds/:key', () => {
  beforeEach(clearDb)

  it('204 + audit, second call 404', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res1 = await app.handle(new Request('http://localhost/api/admin/kinds/theme', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(res1.status).toBe(204)
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'kind.delete'))
    expect(audits).toHaveLength(1)
    const res2 = await app.handle(new Request('http://localhost/api/admin/kinds/theme', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(res2.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
cd apps/backend && bun test tests/routes/kinds.test.ts
```
Expected: FAIL — `/api/admin/kinds/:key` not defined.

- [ ] **Step 3: Implement the admin item route**

Create `apps/backend/src/routes/api/admin/kinds/[key].ts`:

```ts
import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getKind, updateKind, deleteKind, KindError } from '$lib/kinds'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const kindSchema = t.Object({
  key: t.String(),
  label: t.String(),
  description: t.Nullable(t.String()),
})

const putBodySchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 40 }),
  label: t.String({ minLength: 1, maxLength: 60 }),
  description: t.Optional(t.Nullable(t.String({ maxLength: 280 }))),
})

function statusFor(err: KindError, body?: { key: string }, path?: string): number {
  if (err.code === 'duplicate') return 409
  if (err.code === 'not_found') return 404
  if (err.code === 'invalid' && body && path && body.key !== path) return 409
  return 400
}

export default new Elysia()
  .use(adminMiddleware)
  .get('/', ({ params, set }) => {
    const kind = getKind(params.key)
    if (!kind) {
      set.status = 404
      return { error: `kind "${params.key}" not found` }
    }
    return { kind }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Read one plugin kind',
      operationId: 'adminGetKind',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({ kind: kindSchema }),
      404: t.Object({ error: t.String() }),
    },
  })
  .put('/', async ({ params, body, set, admin, request }) => {
    try {
      const updated = await updateKind(params.key, {
        key: body.key,
        label: body.label,
        description: body.description ?? null,
      })
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'kind.update',
        target: `kind:${updated.key}`,
        meta: { key: updated.key },
      })
      return { kind: updated }
    } catch (err) {
      if (err instanceof KindError) {
        set.status = statusFor(err, body, params.key)
        return { error: err.message }
      }
      throw err
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Replace one plugin kind',
      operationId: 'adminUpdateKind',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: putBodySchema,
    response: {
      200: t.Object({ kind: kindSchema }),
      400: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
  .delete('/', async ({ params, set, admin, request }) => {
    try {
      await deleteKind(params.key)
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'kind.delete',
        target: `kind:${params.key}`,
        meta: { key: params.key },
      })
      set.status = 204
      return null
    } catch (err) {
      if (err instanceof KindError) {
        set.status = err.code === 'not_found' ? 404 : 400
        return { error: err.message }
      }
      throw err
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Delete one plugin kind',
      operationId: 'adminDeleteKind',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      204: t.Null(),
      404: t.Object({ error: t.String() }),
    },
  })
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && bun test tests/routes/kinds.test.ts
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/api/admin/kinds/[key].ts apps/backend/tests/routes/kinds.test.ts
git commit -m "feat(backend): admin kinds item — read, replace, delete"
```

---

## Task 6: `GET /api/plugins?kind=…` filter

**Files:**
- Modify: `apps/backend/src/routes/api/plugins/index.ts`
- Modify: `apps/backend/tests/routes/plugins.test.ts`

- [ ] **Step 1: Add failing tests for the new filter**

Append to `apps/backend/tests/routes/plugins.test.ts`:

```ts
import { createKind } from '../../src/lib/kinds'

describe('GET /api/plugins ?kind filter', () => {
  beforeEach(clearDb)

  it('returns plugins tagged with the kind key', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const user = await makeUser()
    await makePlugin(user.id, { id: 'dark', name: 'Dark', tags: JSON.stringify(['theme', 'dark']) })
    await makePlugin(user.id, { id: 'ducks', name: 'Ducks', tags: JSON.stringify(['birds']) })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?kind=theme'))
    const data = await res.json() as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(1)
    expect(data.plugins[0].id).toBe('dark')
  })

  it('returns empty for an unknown kind key', async () => {
    const user = await makeUser()
    await makePlugin(user.id, { id: 'dark', tags: JSON.stringify(['theme']) })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?kind=theme'))
    const data = await res.json() as { total: number }
    expect(data.total).toBe(0)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd apps/backend && bun test tests/routes/plugins.test.ts
```
Expected: FAIL — second test still returns `dark` because `?kind=` is currently ignored.

- [ ] **Step 3: Wire the filter (and prepare the schema for Task 7's facet)**

Open `apps/backend/src/routes/api/plugins/index.ts`. At the top, add the import:

```ts
import { isKindKey } from '../../../lib/kinds'
```

Inside the route handler (just after `const tag = query.tag?.trim()`), add:

```ts
const kindParam = query.kind?.trim()
const kindFilterActive = kindParam !== undefined && kindParam.length > 0
const kindValid = kindFilterActive && isKindKey(kindParam!)
```

In the relational `where` block, after the existing `if (tag) …` line, add:

```ts
if (kindFilterActive) {
  if (!kindValid) {
    return {
      total: 0,
      page,
      limit,
      plugins: [],
      facets: { categories: [], kinds: [] },
    }
  }
  where.tags = { like: `%"${escapeLike(kindParam!)}"%` }
}
```

In the SQL-builder mirror block, add the same conditional:

```ts
if (kindFilterActive && kindValid) builderConditions.push(like(plugins.tags, `%"${escapeLike(kindParam!)}"%`))
```

Add `kind` to the query schema:

```ts
query: t.Object({
  search: t.Optional(t.String()),
  category: t.Optional(t.String()),
  tag: t.Optional(t.String()),
  kind: t.Optional(t.String()),
  featured: t.Optional(t.String()),
  sort: t.Optional(t.Union([t.Literal('updated'), t.Literal('new'), t.Literal('name'), t.Literal('featured')])),
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
}),
```

Update the response schema to add `kinds` to the facets object (kept empty for now; Task 7 fills it):

```ts
const pluginListResponseSchema = t.Object({
  total: t.Number(),
  page: t.Number(),
  limit: t.Number(),
  plugins: t.Array(pluginSummarySchema),
  facets: t.Object({
    categories: t.Array(t.Object({ value: t.String(), count: t.Number() })),
    kinds: t.Array(t.Object({ key: t.String(), label: t.String(), count: t.Number() })),
  }),
})
```

At the bottom of the handler, update the success return to include the empty kinds facet:

```ts
return {
  total,
  page,
  limit,
  plugins: rows.map((p) => projectPlugin(p)),
  facets: { categories, kinds: [] },
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && bun test tests/routes/plugins.test.ts
```
Expected: green — both new `?kind filter` cases pass, all pre-existing cases still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/api/plugins/index.ts apps/backend/tests/routes/plugins.test.ts
git commit -m "feat(backend): GET /api/plugins — ?kind filter validated against registry"
```

---

## Task 7: `GET /api/plugins` — `facets.kinds`

**Files:**
- Modify: `apps/backend/src/routes/api/plugins/index.ts`
- Modify: `apps/backend/tests/routes/plugins.test.ts`

- [ ] **Step 1: Add failing test for the facet**

Append to `apps/backend/tests/routes/plugins.test.ts`:

```ts
describe('GET /api/plugins facets.kinds', () => {
  beforeEach(clearDb)

  it('counts plugins per registered kind, including multi-kind tags', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await createKind({ key: 'snippet', label: 'Snippets', description: null })
    const user = await makeUser()
    await makePlugin(user.id, { id: 'a', tags: JSON.stringify(['theme', 'dark']) })
    await makePlugin(user.id, { id: 'b', tags: JSON.stringify(['snippet']) })
    await makePlugin(user.id, { id: 'c', tags: JSON.stringify(['theme', 'snippet']) })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = await res.json() as { facets: { kinds: Array<{ key: string; count: number }> } }
    const byKey = Object.fromEntries(data.facets.kinds.map((k) => [k.key, k.count]))
    expect(byKey.theme).toBe(2)
    expect(byKey.snippet).toBe(2)
  })

  it('omits kinds that are not in the registry', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const user = await makeUser()
    await makePlugin(user.id, { id: 'a', tags: JSON.stringify(['theme', 'unknown-bucket']) })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = await res.json() as { facets: { kinds: Array<{ key: string }> } }
    expect(data.facets.kinds.map((k) => k.key)).toEqual(['theme'])
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd apps/backend && bun test tests/routes/plugins.test.ts
```
Expected: FAIL — `facets.kinds` not present, schema rejects unknown field if added by accident.

- [ ] **Step 3: Compute the facet inside the route**

Open `apps/backend/src/routes/api/plugins/index.ts`. Extend the existing import line from Task 6 so it also pulls `getKinds`:

```ts
import { getKinds, isKindKey } from '../../../lib/kinds'
```

Find the existing block that builds the `categories` facet (the `.select({ value: plugins.category, count: count() }) … .groupBy(plugins.category)` query) and add the kinds-facet computation immediately after it:

```ts
const kinds = getKinds()
let kindFacet: Array<{ key: string; label: string; count: number }> = []
if (kinds.length > 0) {
  const tagRows = await db
    .select({ tags: plugins.tags })
    .from(plugins)
    .where(eq(plugins.status, 'approved'))
  const counts = new Map<string, number>()
  for (const row of tagRows) {
    if (!row.tags) continue
    let arr: unknown
    try { arr = JSON.parse(row.tags) } catch { continue }
    if (!Array.isArray(arr)) continue
    const seen = new Set<string>()
    for (const t of arr) {
      if (typeof t === 'string' && !seen.has(t)) {
        seen.add(t)
        if (kinds.some((k) => k.key === t)) counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
  }
  kindFacet = kinds.map((k) => ({ key: k.key, label: k.label, count: counts.get(k.key) ?? 0 }))
}
```

Update the success return (replace the `kinds: []` placeholder added in Task 6) to use the computed facet:

```ts
return {
  total,
  page,
  limit,
  plugins: rows.map((p) => projectPlugin(p)),
  facets: { categories, kinds: kindFacet },
}
```

Schema was already updated in Task 6; leave it as-is. The unknown-kind early-return continues to use `kinds: []` (no plugins matched ⇒ nothing to count).

- [ ] **Step 4: Run all plugins tests**

```bash
cd apps/backend && bun test tests/routes/plugins.test.ts
```
Expected: green. Including the previously-deferred kind-filter case from Task 6.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/api/plugins/index.ts apps/backend/tests/routes/plugins.test.ts
git commit -m "feat(backend): GET /api/plugins — facets.kinds per-kind counts"
```

---

## Task 8: `/api/manifest` exposes active kind keys

**Files:**
- Modify: `apps/backend/src/routes/api/manifest/index.ts`
- Create: `apps/backend/tests/routes/manifest.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/tests/routes/manifest.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { createKind } from '../../src/lib/kinds'

describe('GET /api/manifest', () => {
  beforeEach(clearDb)

  it('includes empty kinds when none defined', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/manifest'))
    expect(res.status).toBe(200)
    const data = await res.json() as { kinds: string[] }
    expect(data.kinds).toEqual([])
  })

  it('reflects active kind keys', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    await createKind({ key: 'snippet', label: 'Snippets', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/manifest'))
    const data = await res.json() as { kinds: string[] }
    expect(data.kinds.sort()).toEqual(['snippet', 'theme'])
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd apps/backend && bun test tests/routes/manifest.test.ts
```
Expected: FAIL — `kinds` field missing.

- [ ] **Step 3: Wire the field**

Edit `apps/backend/src/routes/api/manifest/index.ts`. Replace the file content with:

```ts
import { Elysia, t } from 'elysia'
import { ManifestSchema } from '$lib/manifest'
import { getKinds } from '$lib/kinds'

const EXAMPLE = `name: My Plugin
description: A short tagline shown on the catalog card.
category: databases
tags: [theme, dark]
license: MIT
icon: ./assets/icon.svg
screenshots:
  - url: ./assets/screen-1.png
    caption: Live query view
  - url: ./assets/screen-2.png
    caption: Settings panel
documentation_url: https://docs.example.com/my-plugin
homepage: https://example.com/my-plugin
support:
  email: support@example.com
  issues_url: https://github.com/me/my-plugin/issues
min_runtime_version: '2.4.0'
readme: README.md
`

export default new Elysia()
  .get('/', () => ({
    description:
      'Plugin authors drop a `.tabularium` (YAML), `.tabularium.yaml`, `.tabularium.yml`, or `.tabularium.json` file in their repo root. ' +
      'The registry fetches it on submission and on every release webhook. Relative `icon`/`screenshots` paths are resolved against the repo at the matching ref. ' +
      'Tag your plugin with one of the registry\'s active kind keys (see `kinds`) so it appears in kind-filtered views.',
    paths: ['.tabularium', '.tabularium.yaml', '.tabularium.yml', '.tabularium.json'],
    schema: ManifestSchema,
    example: EXAMPLE,
    kinds: getKinds().map((k) => k.key),
  }), {
    detail: {
      tags: ['Plugins'],
      summary: 'Discoverable .tabularium manifest spec',
      description: 'Public reference for plugin authors. Returns the TypeBox JSON Schema, an example, and the registry\'s active kind keys.',
      operationId: 'getManifestSpec',
    },
    response: {
      200: t.Object({
        description: t.String(),
        paths: t.Array(t.String()),
        schema: t.Any(),
        example: t.String(),
        kinds: t.Array(t.String()),
      }),
    },
  })
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && bun test tests/routes/manifest.test.ts
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/api/manifest/index.ts apps/backend/tests/routes/manifest.test.ts
git commit -m "feat(backend): /api/manifest — expose active kind keys"
```

---

## Task 9: Full-suite sanity + Eden type-check

**Files:** none — verification only.

- [ ] **Step 1: Run the full backend test suite**

```bash
cd apps/backend && bun test
```
Expected: all green.

- [ ] **Step 2: TypeScript check**

```bash
cd apps/backend && bunx tsc --noEmit
```
Expected: clean. If Eden Treaty consumers downstream need a rebuild, that surfaces here.

- [ ] **Step 3: Hand-curl smoke tests (optional, dev-mode)**

```bash
cd apps/backend && bun run dev &
# After server is up:
curl -s http://localhost:3000/api/kinds | jq
# Expect {"kinds":[]}
curl -s http://localhost:3000/api/manifest | jq .kinds
# Expect []
# Stop the dev server.
```

- [ ] **Step 4: Final commit if anything was tweaked, otherwise no-op**

If steps 1–3 surfaced nothing, this task closes without a commit.

---

## Task 10: Frontend types

**Files:**
- Modify: `apps/frontend/src/lib/types.ts`

- [ ] **Step 1: Add `Kind` type and extend `PluginListResponse.facets`**

Open `apps/frontend/src/lib/types.ts`. Find the `PluginListResponse` block and add the new type just above it:

```ts
export type Kind = {
  key: string
  label: string
  description: string | null
}
```

Replace the existing `PluginListResponse` definition with:

```ts
export type PluginListResponse = {
  total: number
  page: number
  limit: number
  plugins: Plugin[]
  facets: {
    categories: Array<{ value: string; count: number }>
    kinds: Array<{ key: string; label: string; count: number }>
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/frontend && bunx svelte-check --tsconfig ./tsconfig.json --no-tsconfig 2>&1 | head -40
```
(If `svelte-check` is not installed, fall back to `bunx tsc --noEmit -p tsconfig.json`.)
Expected: no new errors related to `Kind` or `PluginListResponse`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/types.ts
git commit -m "feat(frontend): types — Kind + facets.kinds on PluginListResponse"
```

---

## Task 11: i18n — add new keys to 5 of 6 locales (zh-CN is in Task 16)

**Files:**
- Modify: `apps/frontend/messages/en.json`
- Modify: `apps/frontend/messages/de.json`
- Modify: `apps/frontend/messages/es.json`
- Modify: `apps/frontend/messages/fr.json`
- Modify: `apps/frontend/messages/it.json`

**Important:** the parallel zh-CN translation agent has uncommitted edits in `apps/frontend/messages/zh-CN.json` (visible via `git status` at plan time). Touching it would either drag those edits into our commit or trigger conflicts. Skip zh-CN entirely in this task; it's handled by Task 16 after the parallel agent's work lands. The five remaining locales are all committed and safe to edit.

Each file is a flat JSON object; `paraglide-js` does not care about key order — only **append** the new keys, never reorder or rewrite existing ones.

- [ ] **Step 1: Add the 19 new keys to `en.json`**

In `apps/frontend/messages/en.json`, add the following lines anywhere inside the top-level object (keep the existing trailing-comma discipline — match how the file currently looks at the insertion point):

```json
"admin_nav_kinds": "Kinds",
"admin_kinds_title": "Plugin kinds",
"admin_kinds_subtitle": "Define the categories your end-user app uses to filter plugins. Plugin authors mark their plugin by adding the matching tag.",
"admin_kinds_add_heading": "Add a kind",
"admin_kinds_field_key": "Key",
"admin_kinds_field_key_hint": "Lowercase, digits, dashes (e.g. \"theme\", \"sql-template\"). Immutable after creation.",
"admin_kinds_field_label": "Label",
"admin_kinds_field_description": "Description (optional)",
"admin_kinds_add_button": "Add kind",
"admin_kinds_delete_button": "Delete",
"admin_kinds_delete_confirm": "Delete this kind? Existing plugins keep the tag but stop appearing in the kind facet.",
"admin_kinds_empty": "No kinds defined yet. Add one above.",
"admin_kinds_save_failed": "Failed to save kind",
"admin_kinds_load_failed": "Failed to load kinds",
"admin_kinds_created": "Kind created",
"admin_kinds_updated": "Kind updated",
"admin_kinds_deleted": "Kind deleted",
"admin_kinds_duplicate": "A kind with this key already exists",
"plugins_list_filter_kinds_label": "Kind",
```

- [ ] **Step 2: Add the same 19 keys to `de.json`** with these German values:

```json
"admin_nav_kinds": "Arten",
"admin_kinds_title": "Plugin-Arten",
"admin_kinds_subtitle": "Definiere die Kategorien, mit denen deine Endnutzer-App Plugins filtert. Plugin-Autoren markieren ihr Plugin durch das passende Tag.",
"admin_kinds_add_heading": "Art hinzufügen",
"admin_kinds_field_key": "Schlüssel",
"admin_kinds_field_key_hint": "Kleinbuchstaben, Ziffern, Bindestriche (z. B. „theme", „sql-template"). Nach Anlegen unveränderbar.",
"admin_kinds_field_label": "Bezeichnung",
"admin_kinds_field_description": "Beschreibung (optional)",
"admin_kinds_add_button": "Art hinzufügen",
"admin_kinds_delete_button": "Löschen",
"admin_kinds_delete_confirm": "Diese Art löschen? Bestehende Plugins behalten das Tag, erscheinen aber nicht mehr in der Art-Facette.",
"admin_kinds_empty": "Noch keine Arten definiert. Lege oben eine an.",
"admin_kinds_save_failed": "Art konnte nicht gespeichert werden",
"admin_kinds_load_failed": "Arten konnten nicht geladen werden",
"admin_kinds_created": "Art angelegt",
"admin_kinds_updated": "Art aktualisiert",
"admin_kinds_deleted": "Art gelöscht",
"admin_kinds_duplicate": "Eine Art mit diesem Schlüssel existiert bereits",
"plugins_list_filter_kinds_label": "Art",
```

- [ ] **Step 3: Add the same 19 keys to `es.json`**:

```json
"admin_nav_kinds": "Tipos",
"admin_kinds_title": "Tipos de plugin",
"admin_kinds_subtitle": "Define las categorías que tu aplicación de usuario final usa para filtrar plugins. Los autores marcan su plugin añadiendo la etiqueta correspondiente.",
"admin_kinds_add_heading": "Añadir un tipo",
"admin_kinds_field_key": "Clave",
"admin_kinds_field_key_hint": "Minúsculas, dígitos, guiones (p. ej. «theme», «sql-template»). Inmutable tras la creación.",
"admin_kinds_field_label": "Etiqueta",
"admin_kinds_field_description": "Descripción (opcional)",
"admin_kinds_add_button": "Añadir tipo",
"admin_kinds_delete_button": "Eliminar",
"admin_kinds_delete_confirm": "¿Eliminar este tipo? Los plugins existentes conservan la etiqueta pero dejan de aparecer en la faceta de tipo.",
"admin_kinds_empty": "Aún no hay tipos. Añade uno arriba.",
"admin_kinds_save_failed": "No se pudo guardar el tipo",
"admin_kinds_load_failed": "No se pudieron cargar los tipos",
"admin_kinds_created": "Tipo creado",
"admin_kinds_updated": "Tipo actualizado",
"admin_kinds_deleted": "Tipo eliminado",
"admin_kinds_duplicate": "Ya existe un tipo con esa clave",
"plugins_list_filter_kinds_label": "Tipo",
```

- [ ] **Step 4: Add the same 19 keys to `fr.json`**:

```json
"admin_nav_kinds": "Types",
"admin_kinds_title": "Types de plugin",
"admin_kinds_subtitle": "Définissez les catégories utilisées par votre application pour filtrer les plugins. Les auteurs marquent leur plugin en ajoutant le tag correspondant.",
"admin_kinds_add_heading": "Ajouter un type",
"admin_kinds_field_key": "Clé",
"admin_kinds_field_key_hint": "Minuscules, chiffres, tirets (ex. « theme », « sql-template »). Non modifiable après création.",
"admin_kinds_field_label": "Libellé",
"admin_kinds_field_description": "Description (facultatif)",
"admin_kinds_add_button": "Ajouter le type",
"admin_kinds_delete_button": "Supprimer",
"admin_kinds_delete_confirm": "Supprimer ce type ? Les plugins existants conservent le tag mais disparaissent de la facette type.",
"admin_kinds_empty": "Aucun type défini. Ajoutez-en un ci-dessus.",
"admin_kinds_save_failed": "Échec de l'enregistrement du type",
"admin_kinds_load_failed": "Échec du chargement des types",
"admin_kinds_created": "Type créé",
"admin_kinds_updated": "Type mis à jour",
"admin_kinds_deleted": "Type supprimé",
"admin_kinds_duplicate": "Un type avec cette clé existe déjà",
"plugins_list_filter_kinds_label": "Type",
```

- [ ] **Step 5: Add the same 19 keys to `it.json`**:

```json
"admin_nav_kinds": "Tipi",
"admin_kinds_title": "Tipi di plugin",
"admin_kinds_subtitle": "Definisci le categorie con cui la tua app utente filtra i plugin. Gli autori contrassegnano il proprio plugin aggiungendo il tag corrispondente.",
"admin_kinds_add_heading": "Aggiungi un tipo",
"admin_kinds_field_key": "Chiave",
"admin_kinds_field_key_hint": "Minuscolo, cifre, trattini (es. «theme», «sql-template»). Non modificabile dopo la creazione.",
"admin_kinds_field_label": "Etichetta",
"admin_kinds_field_description": "Descrizione (opzionale)",
"admin_kinds_add_button": "Aggiungi tipo",
"admin_kinds_delete_button": "Elimina",
"admin_kinds_delete_confirm": "Eliminare questo tipo? I plugin esistenti mantengono il tag ma non appaiono più nella faccetta tipo.",
"admin_kinds_empty": "Nessun tipo definito. Aggiungine uno sopra.",
"admin_kinds_save_failed": "Impossibile salvare il tipo",
"admin_kinds_load_failed": "Impossibile caricare i tipi",
"admin_kinds_created": "Tipo creato",
"admin_kinds_updated": "Tipo aggiornato",
"admin_kinds_deleted": "Tipo eliminato",
"admin_kinds_duplicate": "Esiste già un tipo con questa chiave",
"plugins_list_filter_kinds_label": "Tipo",
```

- [ ] **Step 6: Run the paraglide compile**

```bash
cd apps/frontend && bunx paraglide-js compile --project ./project.inlang
```
Expected: regenerates `apps/frontend/src/lib/paraglide/messages.js` (or equivalent) with the new functions `m.admin_nav_kinds`, `m.admin_kinds_title`, etc. (Path to the project may differ — try `bun run dev` first if the compile step is part of dev.)

If paraglide compile is not a manual step in this repo and is wired into the dev/build script: skip the explicit compile and let the dev server / build pick it up.

- [ ] **Step 7: Commit (5 locales only — zh-CN waits for Task 16)**

```bash
git add apps/frontend/messages/en.json apps/frontend/messages/de.json apps/frontend/messages/es.json apps/frontend/messages/fr.json apps/frontend/messages/it.json
git add apps/frontend/src/lib/paraglide/
git commit -m "i18n(frontend): translation keys for plugin-kinds admin + filter (5 locales)"
```

Do NOT `git add apps/frontend/messages/zh-CN.json` here — it carries unrelated uncommitted work from the parallel translation agent. Task 16 picks it up once that work is committed.

---

## Task 12: Admin page `/admin/kinds`

**Files:**
- Create: `apps/frontend/src/routes/admin/kinds/+page.svelte`

- [ ] **Step 1: Write the admin page**

Create `apps/frontend/src/routes/admin/kinds/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Save from '@lucide/svelte/icons/save'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import { eden } from '$lib/eden'
	import type { Kind } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	let kinds = $state<Kind[]>([])
	let loading = $state(true)
	let newKey = $state('')
	let newLabel = $state('')
	let newDescription = $state('')
	let creating = $state(false)
	let savingKey = $state<string | null>(null)

	onMount(loadKinds)

	async function loadKinds() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.kinds.get()
			if (error) throw error
			kinds = (data as { kinds: Kind[] }).kinds
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_load_failed())
		} finally {
			loading = false
		}
	}

	async function addKind() {
		if (!newKey.trim() || !newLabel.trim()) return
		creating = true
		try {
			const { error } = await eden.api.admin.kinds.post({
				key: newKey.trim(),
				label: newLabel.trim(),
				description: newDescription.trim() || null,
			})
			if (error) {
				if (error.status === 409) {
					toast.error(m.admin_kinds_duplicate())
				} else {
					const msg = typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? m.admin_kinds_save_failed())
					toast.error(msg)
				}
				return
			}
			toast.success(m.admin_kinds_created())
			newKey = ''
			newLabel = ''
			newDescription = ''
			await loadKinds()
		} finally {
			creating = false
		}
	}

	async function saveKind(k: Kind) {
		savingKey = k.key
		try {
			const { error } = await eden.api.admin.kinds({ key: k.key }).put({
				key: k.key,
				label: k.label,
				description: k.description,
			})
			if (error) {
				const msg = typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? m.admin_kinds_save_failed())
				toast.error(msg)
				return
			}
			toast.success(m.admin_kinds_updated())
		} finally {
			savingKey = null
		}
	}

	async function deleteKind(k: Kind) {
		if (!confirm(m.admin_kinds_delete_confirm())) return
		try {
			const { error } = await eden.api.admin.kinds({ key: k.key }).delete()
			if (error) {
				const msg = typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? m.admin_kinds_save_failed())
				toast.error(msg)
				return
			}
			toast.success(m.admin_kinds_deleted())
			await loadKinds()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_save_failed())
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_kinds_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_kinds_subtitle()}</p>
</header>

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	{#if kinds.length === 0}
		<p class="text-sm text-muted-foreground italic">{m.admin_kinds_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each kinds as k (k.key)}
				<Card>
					<CardHeader>
						<CardTitle class="text-base font-mono">{k.key}</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_label()}</span>
							<Input bind:value={k.label} />
						</label>
						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_description()}</span>
							<Input bind:value={k.description} />
						</label>
						<div class="flex gap-2 justify-end">
							<Button size="sm" variant="outline" onclick={() => deleteKind(k)}>
								<Trash2 class="h-3.5 w-3.5" />
								{m.admin_kinds_delete_button()}
							</Button>
							<Button size="sm" onclick={() => saveKind(k)} disabled={savingKey === k.key}>
								<Save class="h-3.5 w-3.5" />
								{savingKey === k.key ? m.common_saving() : m.common_apply()}
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_kinds_add_heading()}</CardTitle>
			<CardDescription>{m.admin_kinds_field_key_hint()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_key()}</span>
				<Input bind:value={newKey} placeholder="theme" />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_label()}</span>
				<Input bind:value={newLabel} placeholder="Themes" />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_description()}</span>
				<Input bind:value={newDescription} />
			</label>
			<div class="flex justify-end">
				<Button size="sm" onclick={addKind} disabled={creating || !newKey.trim() || !newLabel.trim()}>
					<Plus class="h-3.5 w-3.5" />
					{m.admin_kinds_add_button()}
				</Button>
			</div>
		</CardContent>
	</Card>
{/if}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/frontend && bunx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -30
```
Expected: no new errors. The Eden type for `.admin.kinds({ key }).put(...)` shape relies on the backend routes existing — if the Eden client is generated from the live backend, ensure the dev server has been (re)started since Task 5 landed.

- [ ] **Step 3: Manual smoke (recommended)**

Start `bun run dev` for both backend and frontend. Visit `http://localhost:5173/admin/kinds`. Verify:
- Empty state renders the i18n empty string.
- Adding a kind shows it in the list.
- Editing label/description and clicking Save shows the updated toast.
- Deleting (with confirm) removes the row.
- Duplicate-key add shows the duplicate toast.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/admin/kinds/+page.svelte
git commit -m "feat(frontend): /admin/kinds — CRUD UI for the kinds registry"
```

---

## Task 13: Admin sidebar — add "Kinds" entry

**Files:**
- Modify: `apps/frontend/src/routes/admin/+layout.svelte`

- [ ] **Step 1: Add the import**

Open `apps/frontend/src/routes/admin/+layout.svelte`. Add this import alongside the other lucide imports near the top of the `<script>` block:

```ts
import Tags from '@lucide/svelte/icons/tags'
```

- [ ] **Step 2: Insert the nav entry**

Find the `sections` array. Add a new entry between `features` and `i18n`:

```ts
{ href: '/admin/features', label: m.admin_nav_features(), icon: ToggleRight, badge: 0 },
{ href: '/admin/kinds', label: m.admin_nav_kinds(), icon: Tags, badge: 0 },
{ href: '/admin/i18n', label: m.admin_nav_languages(), icon: Languages, badge: 0 },
```

- [ ] **Step 3: Verify in the browser**

Restart the frontend dev server. Open `/admin`. The sidebar should show a new "Kinds" link with the Tags icon, between Features and Languages.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/admin/+layout.svelte
git commit -m "feat(frontend): admin sidebar — add Kinds nav entry"
```

---

## Task 14: Public `/plugins` page — kind filter chips

**Files:**
- Modify: `apps/frontend/src/routes/plugins/+page.svelte`

- [ ] **Step 1: Wire the state + URL sync + fetch param**

Open `apps/frontend/src/routes/plugins/+page.svelte`.

After `let tag = $state('')` add:

```ts
let kind = $state('')
```

After the existing `let categories = …` add:

```ts
let kindFacet = $state<Array<{ key: string; label: string; count: number }>>([])
```

In `onMount` (where the URL params are read), after `tag = url.searchParams.get('tag') ?? ''` add:

```ts
kind = url.searchParams.get('kind') ?? ''
```

In `fetchPlugins()`, after `if (tag) query.tag = tag` add:

```ts
if (kind) query.kind = kind
```

In `fetchPlugins()`, where `categories = payload.facets.categories` is set, add:

```ts
kindFacet = payload.facets.kinds
```

In the `$effect` that re-fetches on filter change, add `void kind` alongside the others:

```ts
$effect(() => {
  void category
  void tag
  void kind
  void sort
  void onlyFeatured
  void pageNum
  fetchPlugins()
})
```

Update `hasActiveFilters` and `clearFilters`:

```ts
const hasActiveFilters = $derived(Boolean(category || tag || kind || onlyFeatured || search))

function clearFilters() {
  search = ''
  category = ''
  tag = ''
  kind = ''
  onlyFeatured = false
  sort = 'updated'
  pageNum = 1
}
```

- [ ] **Step 2: Render the chip row**

In the markup, find the categories chip row (the `<span class="text-xs text-muted-foreground uppercase tracking-wider mr-1">` with `{m.plugins_list_categories_label()}` text — search for `category === cat.value`). Add the new kind chip row just above the categories row:

```svelte
{#if kindFacet.length > 0}
	<div class="flex flex-wrap gap-2 items-center">
		<span class="text-xs text-muted-foreground uppercase tracking-wider mr-1">{m.plugins_list_filter_kinds_label()}</span>
		{#each kindFacet as k (k.key)}
			<button
				type="button"
				onclick={() => (kind = kind === k.key ? '' : k.key)}
				aria-pressed={kind === k.key}
			>
				<Badge variant={kind === k.key ? 'default' : 'outline'} class="cursor-pointer">
					{k.label}
					<span class="ml-1 text-[10px] opacity-70">{k.count}</span>
				</Badge>
			</button>
		{/each}
	</div>
{/if}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/frontend && bunx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -30
```
Expected: clean.

- [ ] **Step 4: Manual smoke**

With at least one kind defined and one plugin tagged with that kind: visit `/plugins`. The kind chip row should render with `<label> <count>`. Clicking toggles `?kind=<key>` in the URL and refetches. "Clear filters" resets the chip. If no kinds are defined, the row is hidden.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/routes/plugins/+page.svelte
git commit -m "feat(frontend): /plugins — kind filter chips wired to facets.kinds"
```

---

## Task 15: Frontend type-check + dev smoke

**Files:** none — verification only.

- [ ] **Step 1: Full svelte-check**

```bash
cd apps/frontend && bunx svelte-check --tsconfig ./tsconfig.json
```
Expected: 0 errors, warnings allowed.

- [ ] **Step 2: Dev-server smoke**

Run backend + frontend dev servers. Walk through:
1. Login as admin → `/admin/kinds` → add `theme`.
2. Public `/plugins` → kind chip "Theme" appears (count 0 until a plugin is tagged).
3. Submit/seed a plugin with `tags: [theme]` (or insert via DB for the smoke).
4. `/plugins` → chip count flips to 1; click → URL syncs `?kind=theme` → list filters.
5. Admin → edit the kind's label → public page reflects new label after refresh.
6. Admin → delete the kind → public chip row hides; URL `?kind=theme` returns empty list (still — backend treats unknown key as empty).

- [ ] **Step 3: Final no-op task closes the plan**

---

## Task 16: i18n — zh-CN (deferred until parallel agent commits)

**Pre-flight check before executing this task:**

```bash
git status apps/frontend/messages/zh-CN.json
```

If the file shows as modified or contains uncommitted work, **stop and surface to the user**. The parallel translation agent's edits must be committed first; only then is it safe to add our keys without dragging their diff into our commit.

**Files:**
- Modify: `apps/frontend/messages/zh-CN.json`

- [ ] **Step 1: Confirm clean working tree for `zh-CN.json`**

```bash
git status apps/frontend/messages/zh-CN.json
```
Expected: empty output (file unchanged) or absent. If the file appears in `M` state, abort this task and notify the user.

- [ ] **Step 2: Append the 19 new keys**

In `apps/frontend/messages/zh-CN.json`, append these entries inside the top-level object (matching the file's existing trailing-comma style):

```json
"admin_nav_kinds": "类型",
"admin_kinds_title": "插件类型",
"admin_kinds_subtitle": "定义终端应用用于筛选插件的分类。插件作者通过添加匹配的标签来标记其插件。",
"admin_kinds_add_heading": "添加类型",
"admin_kinds_field_key": "键",
"admin_kinds_field_key_hint": "小写字母、数字、短横线（如 \"theme\"、\"sql-template\"）。创建后不可更改。",
"admin_kinds_field_label": "名称",
"admin_kinds_field_description": "描述（可选）",
"admin_kinds_add_button": "添加类型",
"admin_kinds_delete_button": "删除",
"admin_kinds_delete_confirm": "删除此类型？现有插件保留标签，但不再出现在类型筛选中。",
"admin_kinds_empty": "尚未定义任何类型。请在上方添加。",
"admin_kinds_save_failed": "类型保存失败",
"admin_kinds_load_failed": "类型加载失败",
"admin_kinds_created": "类型已创建",
"admin_kinds_updated": "类型已更新",
"admin_kinds_deleted": "类型已删除",
"admin_kinds_duplicate": "已存在使用此键的类型",
"plugins_list_filter_kinds_label": "类型",
```

- [ ] **Step 3: Compile paraglide (if not handled by dev/build)**

```bash
cd apps/frontend && bunx paraglide-js compile --project ./project.inlang
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/messages/zh-CN.json apps/frontend/src/lib/paraglide/
git commit -m "i18n(frontend): zh-CN translation keys for plugin-kinds"
```

---

## Out of scope (explicitly)

- Strict "max one kind tag per plugin" validation at submit.
- Per-kind icons or localized labels (per-locale label map).
- Promoting `kind` to a first-class `plugins` column.
- Drag-to-reorder kinds (alphabetical / creation-order is fine for now).
