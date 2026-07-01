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
| `prosePre` / `prosePost` | Optional markdown, unbounded length. Rendered above / below the kind's section on the developer docs page. |
| `customExample` | Optional `{ yaml?, json? }`. Replaces the synthesised example on the developer docs page. |
| Total entries | 64 maximum |

`key` is the literal tag value plugin authors write. Pick it carefully — it can't be renamed once created. To rename, delete the kind and add a new one (existing plugins keep the old tag as a freeform tag).

## Localization

`label`, `description`, the public-page `hero` / `intro` strings, and the `prosePre` / `prosePost` markdown each carry an optional `*Translations` map — `{ "de": "...", "fr": "...", ... }`. Missing locales fall back to the default-locale value at render time. Translation values use the same length cap as the base field except for prose, which is unbounded.

## Per-kind required fields

The extensions editor on each kind has a **Required** checkbox per property. Tick it and any manifest tagged with that kind must include the field, or submission fails with a `required` schema verdict.

Under the hood, the registry strips the `required: true` flag from the property node and lifts it into the kind's `then.required[]` branch in the merged JSON Schema. The flag has no equivalent in standard JSON Schema at the property level — it's a Tabularium convention that the engine canonicalises before emitting the schema you see at `/api/manifest`.

Example: marking `engine` and `paradigms` as required on the `driver` kind produces this branch in the merged schema:

```json
{
  "if":   { "properties": { "kind": { "const": "driver" } }, "required": ["kind"] },
  "then": { "required": ["engine", "paradigms"], "properties": { ... } }
}
```

Other kinds keep their own `required` list independently. The same toggle works in the global manifest extensions editor — global `required: true` flags apply to **every** manifest regardless of `kind`. Use the kind-scoped variant when the constraint only makes sense for that subset.

Core manifest fields (e.g. `name`, `description`, `category`) cannot be made required per-kind; their required list is fixed by the manifest core. Only admin-defined extension properties carry the kind-scoped Required flag.

## Editorial fields for the developer docs page

Each kind's section on `/docs/plugin-development` can be customised beyond the auto-generated extension table:

- **`prosePre`** — markdown rendered above the extension table.
- **`prosePost`** — markdown rendered below the example block.
- **`customExample.yaml`** — replaces the auto-synthesised YAML example. Paste a valid YAML document; Tabularium derives a JSON counterpart for the dual code-block UI.
- **`customExample.json`** — same idea for JSON. Either field alone is sufficient; supplying both lets you control the formatting in both representations.

If `customExample` is absent or empty, the page falls back to a synthesised example built from the merged core + global + kind schema.

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

## Enforcement on submissions

Once you've configured at least one kind, an admin can flip on **Require kind on submitted manifests** in `Admin → Instance → Manifest`. With the toggle on, the registry rejects any submitted manifest whose `kind` is missing or doesn't match one of the configured `key`s:

| Outcome                                   | Reason path | Code     |
|-------------------------------------------|-------------|----------|
| `kind:` missing                           | `/kind`     | `required` |
| `kind: foo` not in `[driver, theme, …]`   | `/kind`     | `enum`     |

The toggle is **off-by-default** and cannot be enabled while zero kinds exist (the PUT returns 400 with a clear hint). Disable it any time and submissions accept any `kind` again, including unknown values.

Enforcement runs on every manifest entry point — user submit, submit-preview, admin refresh-manifest, replay-webhook, release-ingest webhook, **and** the public `POST /api/manifest/validate` standalone validator. Validator and submission produce identical verdicts for the same manifest, so author CI gets the same accept/reject answer the real submit path would give.

## What happens when a kind is removed?

Existing plugins keep the tag value in their `tags` array — that's not touched. They just stop appearing in the kind facet on `/api/plugins`. No data is lost.

## UI

`/admin/kinds` shows the list, lets you edit `label`/`description` inline, and add or delete entries. The public `/plugins` page renders a "Kinds" chip row above the categories row when at least one kind is defined.
