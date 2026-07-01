# Plugin developer docs page

The `/docs/plugin-development` route is a **live, admin-customizable developer page** generated on every request from the registry's current state. It pulls the core manifest schema, the global extensions, every registered kind's extensions + examples, and renders the result as a single content-first page with a sticky table of contents and Shiki-highlighted code blocks.

Admins shape the page through `/admin/docs` (intro / outro / custom sections) and `/admin/kinds` (per-kind prose + tailored example). The schema reference lives at `/docs/plugin-development/schema` as a dedicated sub-page.

## What's generated automatically

Out of the box, with no admin content, the page already shows:

- **Title + lead paragraph** — defaults from i18n; overridden by frontmatter (see below).
- **Per-kind sections** — one card per kind, each with extension fields as a table, a synthesised YAML + JSON example, and the kind's description / public-page link.
- **Sticky TOC** — auto-collected H2/H3 anchors from the rendered intro and any custom sections, plus per-kind anchors.
- **Reference block** — links to `/docs/plugin-development/schema` and to the LLM-friendly raw markdown endpoint (see below).

This means a fresh Tabularium install ships with a working plugin developer page from day one.

## Customizing via `/admin/docs`

Three editable areas:

### Intro markdown

Rendered above the kinds section. Supports the **full GFM superset** (GitHub-flavoured tables, fenced code with language hints for syntax highlighting, raw HTML for `<video>` / `<audio>` embeds), plus YAML frontmatter:

```markdown
---
title: "Plugin Development"
excerpt: "Build database driver plugins and publish them to your registry."
category: "Integration"
---

While Tabularis supports major relational databases natively…
```

The frontmatter block at the very top is **auto-detected** at render time:

- `title` → becomes the H1 of the page and the `<title>` tag.
- `excerpt` → becomes the lead paragraph immediately under the H1.
- Other keys (`category`, `order`, …) are parsed but currently unused — they're tolerated so you can paste Tabularis-wiki-style markdown verbatim.
- The fence (`---` block itself) is stripped from the rendered body — only the prose after it shows in the page.

### Outro markdown

Rendered below the kinds section with a top border. Same markdown features as intro; no frontmatter parsing.

### Custom sections

Free-form markdown blocks inserted at one of five anchor positions:

| Position           | Where it lands                              |
|--------------------|----------------------------------------------|
| `page_top`         | Above the auto-generated H1 / lead.          |
| `before_kinds`     | Between intro and the kinds list.            |
| `after_kinds`      | Between kinds and outro.                     |
| `page_bottom`      | Below outro, last thing on the page.         |
| `{ kind, slot }`   | Per-kind — wraps a specific kind's card with `before` / `after`. |

Each section has a stable `id` (used as the anchor URL fragment), an optional title (H2 in `page_*` and `*_kinds`, H3 inside per-kind slots), and a markdown body. Section titles appear in the sticky TOC; H2/H3 inside the body get their own anchors too.

Maximum 64 sections.

### Locale tabs

Every editable area (intro / outro / section title + body) gets per-locale tabs. The default locale is the canonical text; other locales are translation overrides. Missing translations fall back to the default-locale body at render time.

## Per-kind editorial fields (`/admin/kinds`)

Inside each kind row, an "Advanced" details disclosure exposes:

- **`prosePre`** — markdown rendered above the kind's extension table.
- **`prosePost`** — markdown rendered below the example block.
- **`customExample`** — replace the synthesised YAML/JSON example with a hand-curated one (paste either YAML or JSON; the page renders both, converting between formats automatically).

All three are translatable per locale, same pattern as intro/outro.

## Markdown editor

Both `/admin/docs` and the per-kind prose fields use a CodeMirror 6 editor with **inline live preview**: headings render larger inline while the `#` markers stay visible, bold/italic/code styling applied via the syntax tree, YAML frontmatter block shown as a code block, native browser selection. No toolbar — markdown source is the truth.

No character limits — Postgres TEXT is the natural ceiling.

## LLM-friendly export

Every visitor sees a **"Raw markdown (for LLMs) ↗"** link and a **Copy as markdown** button in the page header. Both surface the same endpoint:

```
GET /api/docs/plugin-development?format=md
```

Returns `Content-Type: text/markdown; charset=utf-8` with `Access-Control-Allow-Origin: *`. The response is a flat single-page markdown assembly:

- YAML frontmatter (title / excerpt)
- Intro markdown
- Custom sections at `page_top` / `before_kinds`
- Core manifest fields table
- Global extensions table (if any)
- Per-kind sections — label, key, description, extensions table, YAML example, JSON example, prose pre/post slots
- Custom sections at `after_kinds` / `page_bottom`
- Outro
- A trailing comment line referencing the registry's BASE_URL

This is what to hand to Cursor / Claude / Continue when an LLM needs to know how to write plugins against your registry. Pass `?locale=de` (or any supported locale) to get the translated version.

## What the schema reference covers

`/docs/plugin-development/schema` is the dedicated **technical reference**, separate from the content-first main page:

- Every field of `apps/api/src/lib/manifest-schema.ts` (core fields), localized field descriptions.
- Constraint chips: `pattern`, length ranges, enum values, formats — derived from the live TypeBox schema and surfaced as small badges next to each row.
- Global extension delta (whatever admins configured in `/admin/manifest`).
- A "Use this schema in your editor" callout pointing to the canonical `/manifest.schema.json`.

Both pages share the same `/api/docs/plugin-development` data source; the schema page is just a different presentation of the `coreFields` + `globalExtensions` portion.

## API

| Verb  | Path                                                | Purpose                                                                 |
|-------|-----------------------------------------------------|-------------------------------------------------------------------------|
| `GET` | `/api/docs/plugin-development`                      | Public — JSON shape (`PluginDocs`) used by the SvelteKit page.          |
| `GET` | `/api/docs/plugin-development?format=md`            | Public — flat markdown for LLMs.                                        |
| `GET` | `/api/admin/docs`                                   | Admin — current intro / outro / sections config.                        |
| `PUT` | `/api/admin/docs`                                   | Admin — bulk update intro + outro (incl. translations).                 |
| `GET` | `/api/admin/docs/sections`                          | Admin — list custom sections.                                           |
| `POST` | `/api/admin/docs/sections`                         | Admin — create a section.                                               |
| `PUT` | `/api/admin/docs/sections/:id`                      | Admin — replace a section (id is immutable).                            |
| `DELETE` | `/api/admin/docs/sections/:id`                   | Admin — remove a section.                                               |

Every admin mutation writes an audit-log entry (`docs.config_update`, `docs.section_create`, `docs.section_update`, `docs.section_delete`).
