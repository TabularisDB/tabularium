---
title: "Manifest"
---

# Manifest

Plugins ship a small manifest file at the repo root. Tabularium reads it on every release webhook and stores the parsed result in the `plugins` table.

The exact filename(s) are configurable per registry — defaults are `.tabularium`, `.tabularium.json`, `tabularium.yaml`, and `tabularium.json`. Operators can add their own (e.g. `.tabularis`) or restrict the list to one canonical form. Authors hit any filename in the active whitelist; the registry tries them in order.

The live JSON Schema for your registry is at `/manifest.schema.json` — drop the URL into the manifest's `$schema` field for IDE autocomplete.

## Minimal example

```yaml
$schema: https://your-registry.example/manifest.schema.json
name: Awesome Plugin
description: Does the thing
kind: theme
tags: [search, indexing]
license: Apache-2.0
```

## Core fields

These are the locked Tabularium core. Operators can't remove or shadow them.

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | **Required.** Package identifier *and* URL slug. Same shape as npm / crates.io: starts with a lowercase letter, alphanumerics + `-` only, 1–64 chars (`^[a-z][a-z0-9-]*$`). Pinned at first submit; changing it later does **not** rename the existing slug. Use the README for prose / branding; no separate display-name field. |
| `description` | string | One-line summary (max 280) |
| `category` | string | Used for filtering on `/plugins` (max 40) |
| `kind` | string | One of the admin-defined values from `GET /api/kinds`. Lowercase letters/digits/dashes, max 40. Internally folded into `tags`. See [Admin → Kinds](/admin/kinds/). |
| `tags` | string[] | Free-form tags (max 16) |
| `license` | string | SPDX identifier preferred |
| `icon` | string | Path or URL to square logo |
| `screenshots` | `{ url, caption?, alt? }[]` | Gallery (max 12) |
| `readme` | string | Single-locale fallback. Path to README; rendered with DOMPurify. |
| `readmes` | `Record<locale, path>` | Multi-locale README map, e.g. `{ en: "README.md", de: "README.de.md" }`. See note below. |
| `documentation_url` | string | External docs link (http/https) |
| `homepage` | string | http/https |
| `support` | `{ email?, issues_url? }` | Shown on detail page |
| `min_runtime_version` | string | Per-release; declared in release assets too |

A `$schema` field is allowed at the top — Tabularium strips it before persistence (it's an IDE hint, not data).

### Localized READMEs

When `readmes` is present, the registry fetches each path and serves the matching locale via `/api/plugins/<slug>?locale=de` (falls back to base lang, then `en`, then first available). The `readme` field remains the single-locale fallback — same behavior as before. The detail endpoint always returns `readmeAvailableLocales` so the frontend can render a language switcher.

Locale keys follow BCP-47 (`en`, `de`, `pt-BR`, …); paths are relative to the repo root and resolved at the tagged ref.

> Codeberg/Gitea note: the registry fetches raw content via `/api/v1/.../raw/{path}?ref=<tag>` — the `/contents/` endpoint returns a JSON wrapper that we can't render as markdown, so it's bypassed entirely.

## Extending the manifest for your app

If you're operating a registry for an app like Tabularis, you almost certainly want plugin authors to declare extra fields beyond the Tabularium core. Tabularium supports two layers of extensions:

### Global extensions

In `/admin/manifest`, define properties that appear on **every** plugin manifest. The visual builder covers the common cases (string with enum/pattern, number, integer, boolean, simple arrays/objects); switch to JSON mode for nested or complex shapes.

Example: an operator running a Tabularis instance might add an `x-tabularis` property:

```yaml
$schema: https://registry.tabularis.dev/manifest.schema.json
name: Midnight Theme
kind: theme

x-tabularis:
  mode: dark
  widgets: [clock, weather]
```

The merged schema served at `/manifest.schema.json` includes both the core AND `x-tabularis`, so authors get IDE autocomplete for the whole manifest from a single URL.

Server-side, the registry validates against the same merged schema. Type violations are rejected; truly unknown fields (not in the core, not in extensions) are silently stripped for forward compatibility.

### Per-kind override

Sometimes different plugin kinds need different fields. Themes might want `mode: light|dark`, while SQL Templates want `dialect: postgres|sqlite|mysql`. In `/admin/kinds`, expand the "Custom schema extensions for this kind" panel to define them.

When a manifest declares `kind: theme`, the registry validates it against the **theme** override instead of the global delta. If the kind has no override, plugins of that kind inherit the global extensions.

The served schema folds every kind's extensions in via JSON Schema `if/then` clauses on the `kind` field, so plugin authors still pin to a single URL and get the right autocomplete based on the kind they pick.

For authors who want only the kind-specific schema (more compact), `/manifest.schema.json?kind=theme` returns just that kind's merged schema.

## Validation guardrails

The extensions delta is validated server-side before being persisted:

- Type whitelist: `string`, `number`, `integer`, `boolean`, `array`, `object`
- No `$ref` (no remote schema fetching)
- Max depth 6 for nested objects/arrays
- Max 32 properties per object
- Property names match `/^[A-Za-z_][A-Za-z0-9_-]*$/`
- Cannot shadow a core field (name, description, kind, tags, ...)

## Endpoints

- `GET /manifest.schema.json` — merged JSON Schema (core ∪ all extensions, IDE-friendly)
- `GET /manifest.schema.json?kind=theme` — kind-scoped merged schema
- `GET /api/manifest` — same schema plus the registry's currently active `kinds: string[]` and an authoring example
