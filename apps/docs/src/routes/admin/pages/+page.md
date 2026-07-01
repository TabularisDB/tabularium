---
title: "Pages (CMS)"
---

# Pages (CMS)

Tabularium ships a built-in markdown CMS so the public site is editable without code changes. Every public route — `/`, `/plugins`, `/requests` — can be overridden, and you can add arbitrary new routes like `/about` or `/docs/welcome`.

## Default pages

The install wizard seeds three footer pages from `apps/api/src/db/seeds/pages/*.md`:

- `about` → `/about` (in footer)
- `terms` → `/terms` (in footer)
- `privacy` → `/privacy` (in footer)

The framework's own routes (`/`, `/plugins`, `/requests`) render through SvelteKit by default — create a CMS row with the matching path to override any of them.

## Override priority

Public routes check the CMS first. If a published page matches the path, its rendered HTML replaces the default Svelte view. Remove or unpublish the page to fall back to the framework default.

## Translations

Each page row is keyed by `(slug, locale)`. The default-locale row is canonical; translated rows store the same `path` so `/about?locale=de` returns the German version. Missing translations fall back to the default locale automatically — visitors never see a 404 because a translation hasn't been written yet.

To add a translation in admin → Pages, drill into the slug, switch the locale picker, and write the translated title + content. Saving creates a new row if none exists yet.

## Widgets

Page bodies may embed widgets via custom HTML tags (rendered by the SvelteKit catch-all):

```html
<tabularium-widget kind="popular-plugins" limit="6" />
<tabularium-widget kind="recent-plugins" />
<tabularium-widget kind="stats" />
```

Available kinds: `featured-plugins`, `popular-plugins`, `recent-plugins`, `popular-requests`, `plugin-grid`, `stats`.

## Footer

Pages with `showInFooter: true` appear in the footer's Resources column, ordered by `navOrder`.
