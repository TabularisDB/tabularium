# Plugin Types Registry — Design

**Date:** 2026-05-14
**Status:** Draft — backend only. Frontend deferred (parallel translation work in flight).

## Summary

Let the registry admin define a list of **plugin types** (e.g. *Theme*, *Snippet*, *SQL Template* for Tabularis; anything else for a fork). The list is stored as an admin-managed setting. Plugin authors mark their plugin's type by including a matching tag in the existing `tags` field. End-user apps consume the type list and per-type counts via the public API so they can render type filters without hardcoding the taxonomy.

No DB schema migration. No change to the `plugins` table. No change to the `.tabularium` manifest schema.

## Motivation

Tabularis hosts several structurally identical things under one umbrella: regular plugins, themes, snippets, SQL templates. They all live in a git repo, ship releases, have a manifest. Modeling them as separate tables or as a hard-coded enum would either duplicate machinery or force a code deploy each time a fork wants a new type. A theme is just a plugin with a label. The label is what needs to be configurable.

## Non-goals

- **No** new column on `plugins`. Types live in `tags`.
- **No** seed data — registry starts empty on a fresh install; admin opts in.
- **No** manifest schema change. Authors keep using `tags: [theme, dark]`.
- **No** frontend changes in this spec. A follow-up spec will wire admin UI + public filter chips after the i18n agent finishes.
- **No** strict "at most one type-tag per plugin" rule. Multiple type tags are tolerated; the plugin appears in each matching type's facet.

## Data model

A new settings entry `plugin_types` holds a JSON array of type definitions:

```json
[
  { "key": "theme",        "label": "Themes",        "description": "Visual themes." },
  { "key": "snippet",      "label": "Snippets",      "description": "Reusable code snippets." },
  { "key": "sql-template", "label": "SQL Templates", "description": null }
]
```

Constraints:
- `key`: 1–40 chars, slug-shape (`^[a-z0-9][a-z0-9-]*$`). Must be unique within the array. Becomes the literal tag value plugin authors write.
- `label`: 1–60 chars. Display name for the type.
- `description`: optional, ≤ 280 chars. Shown in admin UI and the public type catalog endpoint.
- Maximum **64** entries (sanity cap; nothing in the design needs an upper bound, but cap protects the settings cache).

On a fresh install: setting does not exist → public catalog returns `[]`, facets return `[]`, `?type=…` matches nothing. Admin chooses whether to populate.

## Backend changes

### New module: `apps/backend/src/lib/plugin-types.ts`

Single helper, no caching of its own (rides on the existing settings cache):

```ts
export type PluginTypeDef = { key: string; label: string; description: string | null }

export function getPluginTypes(): PluginTypeDef[]
// reads `plugin_types` from settings cache, returns [] if unset or invalid

export async function setPluginTypes(next: PluginTypeDef[]): Promise<void>
// validates shape + uniqueness, persists via setSetting

export function isPluginTypeKey(key: string): boolean
// quick membership check used by ?type=... validation
```

Validation errors throw `Error` with a message safe to bubble up to a 400 response.

### Admin endpoints

**File:** `apps/backend/src/routes/api/admin/plugin-types/index.ts`

- `GET /api/admin/plugin-types`
  Returns `{ types: PluginTypeDef[] }`. Same shape regardless of whether the setting is unset.
- `PUT /api/admin/plugin-types`
  Body: `{ types: PluginTypeDef[] }`. Atomic replace — the array fully overwrites whatever was there. Validates with `setPluginTypes`. On success: audit log entry `plugin_types.update` with meta `{ count: N }`.
- Both gated by `adminMiddleware`. OpenAPI tag: `Admin`.

### Public catalog endpoint

**File:** `apps/backend/src/routes/api/plugin-types/index.ts`

- `GET /api/plugin-types`
  Returns `{ types: PluginTypeDef[] }`. Public, no auth. So plugin authors and end-user apps can discover the active type list without scraping the admin endpoint.
- OpenAPI tag: `Plugins`.

### `GET /api/plugins` — list endpoint additions

Edit `apps/backend/src/routes/api/plugins/index.ts`:

1. **New query param:** `type?: string`.
   - If unset → no filter.
   - If set and not a known type key → return empty page (`total: 0`, `plugins: []`). Treating unknown keys as "no match" is friendlier than 400 for an end-user app whose admin just removed a type.
   - If set and known → filter is `tags LIKE %"<key>"%`, same shape as the existing `tag` filter, but the value is validated against `isPluginTypeKey`.
2. **New facet:** `types: Array<{ key: string; label: string; count: number }>`.
   - Computed by running the existing approved-plugins query once, grouping by tag, and intersecting with the registry. Implementation: select all approved plugins' `tags` (just the tags column, no full rows), parse, count occurrences of each registry key. Cost: one extra cheap query per list call. Acceptable for current scale; cache layer can wrap it later if needed.
3. **Response schema** grows `facets.types` alongside `facets.categories`.

### `/api/manifest` documentation

Edit `apps/backend/src/routes/api/manifest/index.ts`:

- Response gains a new field `pluginTypes: string[]` — the currently active type keys (from `getPluginTypes`). Lets manifest authors discover what tag values are meaningful in *this* registry.
- The existing `description` text mentions: "Tag your plugin with one of the registry's active type keys (see `pluginTypes`) so it appears in type-filtered views."
- Example string updated to include a type tag (`tags: [theme, dark]` rather than the current `tags: [postgres, sql, analytics]`).

### Audit log

One new action key:
- `plugin_types.update` — meta: `{ count }`. Recorded via the existing `recordAudit` helper.

### Tests

- `bun:test` for `lib/plugin-types.ts`: validation rejects bad shapes, duplicates, oversized arrays; round-trip via the settings cache.
- Route-level tests for `GET /api/plugin-types` (returns [] on fresh install; returns admin-set list).
- Route-level test for list endpoint: `?type=theme` returns plugins tagged `theme`; unknown type returns empty; facet counts are correct against a seeded fixture.
- Admin route test: `PUT /api/admin/plugin-types` writes audit log, replaces atomically.

## What plugin authors do

Nothing new in `.tabularium`. Author writes:

```yaml
tags: [theme, dark]
```

If `theme` is in the registry, the plugin appears in the `theme` facet and matches `?type=theme`. If the admin later removes `theme` from the registry, the tag stays in the row as a freeform tag; the plugin just stops appearing in the type facet. No data loss, no migration.

## End-user-app perspective

A consumer app (Tabularis itself, or any other client) builds a type filter UI by hitting:

1. `GET /api/plugin-types` — to know which buckets exist and how to label them.
2. `GET /api/plugins?type=<key>` — to fetch the plugins in a bucket.
3. `GET /api/plugins` and read `facets.types` — to render type chips with counts in a single round-trip.

## Tradeoffs (recorded for the implementation review)

- **Multiple type-tags allowed.** A plugin tagged `[theme, snippet]` shows up in both facets. Future strict-mode flag is possible; not in this spec.
- **No referential integrity.** Removing a type from the registry leaves orphaned tags. We accept this — tags are freeform.
- **Facet cost.** Computing per-type counts re-scans approved plugins' tags. Fine until ~10k plugins; revisit with a cache or materialized count when measurements say so.
- **No frontend in scope.** Admin UI for managing the list and public filter chips ship separately, behind whatever the parallel i18n work is doing.

## Out of scope / future

- Strict-mode "max one type tag per plugin" validation at submit.
- Icons per type (currently key + label + description; icon URL can be added later without a breaking change).
- Localized labels (per-locale `label` map — same idea as branding's `taglineTranslations`). Punt until needed.
- Promoting types to first-class column (`plugins.type`) — only if performance or referential needs force it.
