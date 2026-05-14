# Plugin Kinds Registry — Design

**Date:** 2026-05-14
**Status:** Draft — backend only. Frontend deferred (parallel translation work in flight).

## Summary

Let the registry admin define a list of **plugin kinds** (e.g. *Theme*, *Snippet*, *SQL Template* for Tabularis; anything else for a fork). The list is stored as an admin-managed setting. Plugin authors mark their plugin's kind by including a matching tag in the existing `tags` field. End-user apps consume the kind list and per-kind counts via the public API so they can render kind filters without hardcoding the taxonomy.

No DB schema migration. No change to the `plugins` table. No change to the `.tabularium` manifest schema.

## Motivation

Tabularis hosts several structurally identical things under one umbrella: regular plugins, themes, snippets, SQL templates. They all live in a git repo, ship releases, have a manifest. Modeling them as separate tables or as a hard-coded enum would either duplicate machinery or force a code deploy each time a fork wants a new kind. A theme is just a plugin with a label. The label is what needs to be configurable.

## Non-goals

- **No** new column on `plugins`. Kinds live in `tags`.
- **No** seed data — registry starts empty on a fresh install; admin opts in.
- **No** manifest schema change. Authors keep using `tags: [theme, dark]`.
- **No** frontend changes in this spec. A follow-up spec will wire admin UI + public filter chips after the i18n agent finishes.
- **No** strict "at most one kind-tag per plugin" rule. Multiple kind tags are tolerated; the plugin appears in each matching kind's facet.

## Data model

A new settings entry `plugin_kinds` holds a JSON array of kind definitions:

```json
[
  { "key": "theme",        "label": "Themes",        "description": "Visual themes." },
  { "key": "snippet",      "label": "Snippets",      "description": "Reusable code snippets." },
  { "key": "sql-template", "label": "SQL Templates", "description": null }
]
```

Constraints:
- `key`: 1–40 chars, slug-shape (`^[a-z0-9][a-z0-9-]*$`). Must be unique within the array. Becomes the literal tag value plugin authors write.
- `label`: 1–60 chars. Display name for the kind.
- `description`: optional, ≤ 280 chars. Shown in admin UI and the public kind catalog endpoint.
- Maximum **64** entries (sanity cap; nothing in the design needs an upper bound, but cap protects the settings cache).

On a fresh install: setting does not exist → public catalog returns `[]`, facets return `[]`, `?kind=…` matches nothing. Admin chooses whether to populate.

## Backend changes

### New module: `apps/backend/src/lib/kinds.ts`

Single helper module backing the strict-REST routes. No caching of its own — rides on the existing settings cache.

```ts
export type KindDef = { key: string; label: string; description: string | null }

export class KindError extends Error {
  constructor(public code: 'invalid' | 'duplicate' | 'not_found', message: string)
}

// Reads `plugin_kinds` from settings cache. Returns [] if unset or invalid.
export function getKinds(): KindDef[]

// Returns the single kind or null. Pure read.
export function getKind(key: string): KindDef | null

// Quick membership check used by `?kind=…` validation on the public list.
export function isKindKey(key: string): boolean

// Validates one definition (shape, key slug, length limits). Throws KindError('invalid').
export function validateKindDef(input: unknown): KindDef

// Append. Throws 'duplicate' if key exists, 'invalid' on shape errors.
export async function createKind(def: KindDef): Promise<KindDef>

// Replace one (key in def must match `key` argument). Throws 'not_found' or 'invalid'.
export async function updateKind(key: string, def: KindDef): Promise<KindDef>

// Remove one. Throws 'not_found' if missing.
export async function deleteKind(key: string): Promise<void>
```

Each mutating helper does a *read-validate-write* on the JSON-encoded settings array via `getSetting` / `setSetting`. Concurrent admin writes are not a real concern (single admin, low frequency); the settings cache write is awaited so a follow-up read sees the change. The route layer maps `KindError.code` to HTTP status (`invalid → 400`, `duplicate → 409`, `not_found → 404`).

### Admin endpoints (strict REST)

The registry is one collection of kind resources, each identified by its `key`. Storage is still a single JSON array in `settings.plugin_kinds`; the route layer serializes individual mutations on top of the lib helpers. All endpoints gated by `adminMiddleware`, OpenAPI tag `Admin`.

**Files:**
- `apps/backend/src/routes/api/admin/kinds/index.ts` — collection
- `apps/backend/src/routes/api/admin/kinds/[key].ts` — item

| Verb | Path | Purpose | Body | Success | Errors |
|------|------|---------|------|---------|--------|
| `GET` | `/api/admin/kinds` | List all | — | `200 { kinds: KindDef[] }` | — |
| `POST` | `/api/admin/kinds` | Create one | `KindDef` | `201 { kind: KindDef }` + `Location: /api/admin/kinds/{key}` | `400` invalid shape · `409` key already exists |
| `GET` | `/api/admin/kinds/:key` | Read one | — | `200 { kind: KindDef }` | `404` unknown key |
| `PUT` | `/api/admin/kinds/:key` | Replace one (full) | `KindDef` minus `key` (or with matching `key`) | `200 { kind: KindDef }` | `400` invalid shape · `404` unknown key · `409` body `key` mismatches path |
| `DELETE` | `/api/admin/kinds/:key` | Remove one | — | `204` | `404` unknown key |

Rules:
- `key` is **immutable**. `PUT` does not rename; if the body carries a `key`, it must match the path. Renaming = `DELETE` + `POST` (the admin owns the tag-migration consequences for existing plugins).
- `POST` rejects duplicate `key` with `409`; clients can pre-flight with `GET /:key` if they care.
- Body validation lives in `validateKindDef` (one shared helper).

Audit-log actions:
- `kind.create` — meta: `{ key }`
- `kind.update` — meta: `{ key }`
- `kind.delete` — meta: `{ key }`

### Public catalog endpoint

**File:** `apps/backend/src/routes/api/kinds/index.ts`

- `GET /api/kinds`
  Returns `{ kinds: KindDef[] }`. Public, no auth. So plugin authors and end-user apps can discover the active kind list without scraping the admin endpoint.
- OpenAPI tag: `Plugins`.

### `GET /api/plugins` — list endpoint additions

Edit `apps/backend/src/routes/api/plugins/index.ts`:

1. **New query param:** `kind?: string`.
   - If unset → no filter.
   - If set and not a known kind key → return empty page (`total: 0`, `plugins: []`). Treating unknown keys as "no match" is friendlier than 400 for an end-user app whose admin just removed a kind.
   - If set and known → filter is `tags LIKE %"<key>"%`, same shape as the existing `tag` filter, but the value is validated against `isKindKey`.
2. **New facet:** `kinds: Array<{ key: string; label: string; count: number }>`.
   - Computed by running the existing approved-plugins query once, grouping by tag, and intersecting with the registry. Implementation: select all approved plugins' `tags` (just the tags column, no full rows), parse, count occurrences of each registry key. Cost: one extra cheap query per list call. Acceptable for current scale; cache layer can wrap it later if needed.
3. **Response schema** grows `facets.kinds` alongside `facets.categories`.

### `/api/manifest` documentation

Edit `apps/backend/src/routes/api/manifest/index.ts`:

- Response gains a new field `kinds: string[]` — the currently active kind keys (from `getKinds`). Lets manifest authors discover what tag values are meaningful in *this* registry.
- The existing `description` text mentions: "Tag your plugin with one of the registry's active kind keys (see `kinds`) so it appears in kind-filtered views."
- Example string updated to include a kind tag (`tags: [theme, dark]` rather than the current `tags: [postgres, sql, analytics]`).

### Tests

- `bun:test` for `lib/kinds.ts`:
  - `validateKindDef` rejects bad shapes, non-slug keys, oversized fields.
  - `createKind` appends; rejects duplicate `key` with `KindError('duplicate')`; enforces the 64-entry cap.
  - `updateKind` rejects mismatched key and missing key; round-trip via the settings cache.
  - `deleteKind` removes; second delete throws `not_found`.
- Route-level tests for public `GET /api/kinds` (empty on fresh install; populated after admin writes).
- Route-level tests for `GET /api/plugins`:
  - `?kind=theme` returns plugins tagged `theme`; unknown kind returns empty.
  - `facets.kinds` counts are correct against a seeded fixture, including a plugin tagged with two kind keys.
- Admin route tests:
  - `POST /api/admin/kinds` → 201 + `Location` header; duplicate POST → 409.
  - `GET /:key` → 200 / 404.
  - `PUT /:key` → 200; body-key mismatch → 409; unknown key → 404.
  - `DELETE /:key` → 204; second call → 404.
  - All mutations write an audit-log row with the right `action` + `meta.key`.

## What plugin authors do

Nothing new in `.tabularium`. Author writes:

```yaml
tags: [theme, dark]
```

If `theme` is in the registry, the plugin appears in the `theme` facet and matches `?kind=theme`. If the admin later removes `theme` from the registry, the tag stays in the row as a freeform tag; the plugin just stops appearing in the kind facet. No data loss, no migration.

## End-user-app perspective

A consumer app (Tabularis itself, or any other client) builds a kind filter UI by hitting:

1. `GET /api/kinds` — to know which buckets exist and how to label them.
2. `GET /api/plugins?kind=<key>` — to fetch the plugins in a bucket.
3. `GET /api/plugins` and read `facets.kinds` — to render kind chips with counts in a single round-trip.

## Tradeoffs (recorded for the implementation review)

- **Multiple kind-tags allowed.** A plugin tagged `[theme, snippet]` shows up in both facets. Future strict-mode flag is possible; not in this spec.
- **No referential integrity.** Removing a kind from the registry leaves orphaned tags. We accept this — tags are freeform.
- **Facet cost.** Computing per-kind counts re-scans approved plugins' tags. Fine until ~10k plugins; revisit with a cache or materialized count when measurements say so.
- **No frontend in scope.** Admin UI for managing the list and public filter chips ship separately, behind whatever the parallel i18n work is doing.

## Out of scope / future

- Strict-mode "max one kind tag per plugin" validation at submit.
- Icons per kind (currently key + label + description; icon URL can be added later without a breaking change).
- Localized labels (per-locale `label` map — same idea as branding's `taglineTranslations`). Punt until needed.
- Promoting kinds to first-class column (`plugins.kind`) — only if performance or referential needs force it.
