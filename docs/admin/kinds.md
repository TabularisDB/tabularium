# Plugin kinds

The kinds registry is an admin-defined taxonomy of plugin "types" — Themes, Snippets, SQL Templates, anything your fork wants. End-user apps consume it to render filter chips without hardcoding the list.

A theme is structurally the same as a regular plugin: a git repo, a manifest, releases. The kind is just a label on the plugin's `tags`.

## Concept

- The admin defines a list of kinds, each with `key`, `label`, and an optional `description`.
- Plugin authors mark their plugin's kind by adding the matching value to the `tags` field in `.tabularium`. Example: `tags: [theme, dark]`.
- The public catalog endpoint `GET /api/kinds` exposes the active list.
- `GET /api/plugins?kind=<key>` filters; the response's `facets.kinds` array carries per-kind counts so end-user apps can render chips in one round-trip.

A plugin tagged with two kinds (`tags: [theme, snippet]`) appears in both facets — multiple kinds are tolerated.

## Constraints

| Field | Rule |
|-------|------|
| `key` | 1–40 chars, lowercase letters / digits / dashes, must start with a letter or digit. Immutable. |
| `label` | 1–60 chars. |
| `description` | Optional, ≤ 280 chars. |
| Total entries | 64 maximum |

`key` is the literal tag value plugin authors write. Pick it carefully — it can't be renamed once created. To rename, delete the kind and add a new one (existing plugins keep the old tag as a freeform tag).

## API

| Verb | Path | Purpose |
|------|------|---------|
| `GET` | `/api/kinds` | Public — list of active kinds |
| `GET` | `/api/admin/kinds` | Admin — full list |
| `POST` | `/api/admin/kinds` | Admin — create one |
| `GET` | `/api/admin/kinds/:key` | Admin — read one |
| `PUT` | `/api/admin/kinds/:key` | Admin — replace one (key is immutable; the body `key` must match the path) |
| `DELETE` | `/api/admin/kinds/:key` | Admin — remove one |

Every admin mutation writes an audit-log entry (`kind.create`, `kind.update`, `kind.delete`).

## What happens when a kind is removed?

Existing plugins keep the tag value in their `tags` array — that's not touched. They just stop appearing in the kind facet on `/api/plugins`. No data is lost.

## UI

`/admin/kinds` shows the list, lets you edit `label`/`description` inline, and add or delete entries. The public `/plugins` page renders a "Kinds" chip row above the categories row when at least one kind is defined.
