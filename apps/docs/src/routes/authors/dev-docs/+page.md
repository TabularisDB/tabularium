---
title: "Plugin developer docs"
---

# Plugin developer docs

Every Tabularium instance ships a live, content-first **plugin developer docs page** at `/docs/plugin-development`. It's generated on every request from the registry's current state, so the page you see is always in sync with the schema, kinds, and extensions the admin configured.

For plugin authors, this is the canonical place to learn how to write a plugin **for this specific registry** — the field tables, examples, and prose are tailored to the instance, not a generic template.

## What's on the page

- **Title + lead** — from the registry's frontmatter (admin-set) or i18n defaults.
- **Custom prose** — intro, outro, and free-form custom sections the admin added.
- **Per-kind reference** — every plugin kind the registry tracks, with:
  - The kind's extension fields as a table (field name, type, required, description, constraint chips for length / pattern / enum).
  - A YAML and a JSON example you can paste verbatim into a `.tabularium` file.
  - Optional editorial prose before and after each card.
- **Schema sub-page** at `/docs/plugin-development/schema` — every core manifest field with full constraint detail, plus the global extension delta and a callout to the canonical `manifest.schema.json`.
- **Sticky table of contents** — auto-built from H2/H3 anchors in the rendered body. Long pages get a scrollable TOC, with a pinned "Reference" block at the top of the sidebar.
- **Syntax-highlighted code blocks** — Shiki with `github-light` / `github-dark`. Languages: bash, json, ts, js, yaml, rust, go, python, html, css, sql, toml, markdown, diff, dockerfile.

## Raw markdown for LLMs

The page header has a **"Raw markdown (for LLMs) ↗"** link and a **Copy as markdown** button. Both point at:

```
GET /api/docs/plugin-development?format=md
```

The response is a single flat markdown document — frontmatter, intro, every kind with its example, custom sections, outro. It's served with `Content-Type: text/markdown; charset=utf-8` and CORS open to any origin, so LLM IDEs (Cursor, Continue, Claude) can fetch it directly.

Pass `?locale=de` (or any supported locale) for the translated version. Example:

```bash
curl "https://tabularis.dev/api/docs/plugin-development?format=md" | pbcopy
```

Use this when an LLM needs to know how to write a plugin manifest against your registry — paste the response into the chat and the model has the complete picture: schema, kinds, examples, custom guidance.

## How the registry decides what to show

Three layers compose the page, in order of precedence:

1. **Auto-generated** from the live `ManifestSchema` (TypeBox), the global extensions delta (admin → `/admin/manifest`), and each kind's per-kind extension delta (admin → `/admin/kinds`).
2. **Per-kind editorial fields** — `prosePre`, `prosePost`, `customExample` set by the admin on individual kinds.
3. **Page-wide editorial content** — intro / outro markdown and custom sections set by the admin on `/admin/docs`.

For instance maintainers, see [Admin → Developer docs](/admin/docs/) for the editorial controls.

## Discovering other registries

Tabularis itself reads the plugin developer docs from whichever registry the user's `customRegistryUrl` points at. The default `tabularis.dev` instance serves its own version of this page; self-hosted instances serve their own, tailored to whatever the admin configured.

The schema sub-page also links the canonical `manifest.schema.json` — point your editor (VS Code, Zed) at that URL to get autocompletion and validation when writing a `.tabularium` file against this instance.
