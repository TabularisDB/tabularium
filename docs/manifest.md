# `.tabularium` manifest

Plugins ship a `.tabularium.json` (or `.tabularium.yaml`) in the repo root. Tabularium reads it on every release webhook and stores the parsed result in the `plugins` table.

## Minimal example

```json
{
  "name": "Awesome Plugin",
  "description": "Does the thing",
  "category": "utility",
  "kind": "theme",
  "tags": ["search", "indexing"],
  "license": "MIT"
}
```

## Full schema

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Display name |
| `description` | string | One-line summary |
| `category` | string | Used for filtering on `/plugins` |
| `kind` | string | Matches one of the admin-defined values from `GET /api/kinds`. Lowercase letters / digits / dashes, max 40 chars. Internally folded into `tags` so generic tag filters keep working. See [Admin → Kinds](admin/kinds.md). |
| `tags` | string[] | Free-form tags |
| `license` | string | SPDX identifier preferred |
| `iconUrl` | string | Square logo |
| `screenshots` | `{ url, caption?, alt? }[]` | Gallery |
| `readme` | string | Markdown; rendered with DOMPurify |
| `documentationUrl` | string | External docs link |
| `supportEmail` | string | Shown on detail page |
| `issuesUrl` | string | Issue tracker URL |
| `minRuntimeVersion` | string | Per-release; declared in release assets too |

The full JSON Schema, an example, and the registry's currently active `kinds: string[]` are at `GET /api/manifest`. Plugins whose `kind` is no longer in the registry stay in the catalog as freeform-tagged entries — they just stop appearing in kind facets.
