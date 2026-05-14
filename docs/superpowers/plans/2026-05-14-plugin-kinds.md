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

## Out of scope (explicitly)

- Frontend admin UI and public filter chips — separate spec/plan after the i18n agent finishes.
- Strict "max one kind tag per plugin" validation at submit.
- Per-kind icons or localized labels.
- Promoting `kind` to a first-class `plugins` column.
