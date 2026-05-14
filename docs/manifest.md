# `.tabularium` manifest

Plugins ship a `.tabularium.json` (or `.tabularium.yaml`) in the repo root. Tabularium reads it on every release webhook and stores the parsed result in the `plugins` table.

## Minimal example

```json
{
  "name": "Awesome Plugin",
  "description": "Does the thing",
  "category": "utility",
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
| `tags` | string[] | Free-form tags |
| `license` | string | SPDX identifier preferred |
| `iconUrl` | string | Square logo |
| `screenshots` | `{ url, caption?, alt? }[]` | Gallery |
| `readme` | string | Markdown; rendered with DOMPurify |
| `documentationUrl` | string | External docs link |
| `supportEmail` | string | Shown on detail page |
| `issuesUrl` | string | Issue tracker URL |
| `minRuntimeVersion` | string | Per-release; declared in release assets too |

The full JSON Schema is at `GET /api/manifest` and reachable from the footer.
