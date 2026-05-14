# TODO

## Done (latest sprint)

**Manifest + metadata**
- `.tabularium` / `.tabularium.yaml` / `.tabularium.yml` / `.tabularium.json` manifest spec with TypeBox validation.
- Fetch on submit + re-fetch in background on every release webhook (via owner's stored OAuth token).
- Public spec endpoint at `GET /api/manifest` for plugin authors.
- Admin re-fetch endpoint at `POST /api/admin/plugins/:id/refresh-manifest`.
- New columns on `plugins`: category, tags, license, iconUrl, screenshots, readme, documentationUrl, supportEmail, issuesUrl, manifestFetchedAt, manifestVersion, featured, featuredOrder.

**Markdown CMS**
- `markdown_pages` table with `path` column (unique).
- Path-based public routing: pages live at any non-reserved URL the admin picks. `/` overrides the default homepage. Default for new pages: `/pages/<slug>`.
- Reserved-path validator rejects collisions with `/admin /api /auth /openapi /uploads /login /welcome /init /settings /plugins /requests /submit /healthz /robots.txt`.
- Public REST: `GET /api/pages`, `GET /api/pages/by-path?path=…` (server-rendered + DOMPurify-sanitized HTML, 10-min cache).
- Admin REST: full CRUD with path validation, all mutations audit-logged.
- Frontend catch-all `[...path]/+page.svelte` resolves any non-app URL.
- `+page.svelte` (homepage) checks for a `path = '/'` page first, falls back to default landing.
- Carta-md editor in admin with widget-snippet insert buttons.
- Footer auto-lists pages with `show_in_footer`.

**Page widgets**
- DOMPurify allowlists `<tabularium-widget>` as a custom element with `data-*` attributes.
- Frontend `hydrateWidgets()` walks rendered HTML and mounts a Svelte component into each `<tabularium-widget>`.
- Initial widgets: `featured-plugins`, `recent-plugins`, `popular-plugins`, `plugin-grid` (category/tag/sort params), `popular-requests`, `stats`.
- Widget params via attributes: `limit`, `cols`, `category`, `tag`, `sort`, `heading`.

**Public UX polish**
- Landing rebuilt: branded hero, Featured section (admin-pinned), Latest releases, stats.
- Plugin detail polished: icon + screenshots gallery (lightbox), Install snippet (curl, copy button), rendered README, categories + tags chips (clickable), license badge, docs/issues/email/repo buttons.
- `/plugins` index: search debounced + category facet chips + tag filter + sort (updated/new/name/featured) + featured toggle + clear filters.
- Error page (`+error.svelte`) for 404 + 5xx with CTA back home.
- PluginCard renders icon + category + license badge.

**Admin polish**
- Overview dashboard: real counts (providers/users/approved/pending/rejected), recent plugin activity, audit log preview, system health card from `/healthz`.
- Sidebar: pending-count badge on Plugins link; new Pages + Audit-log nav entries. Mobile collapses to drawer.
- Plugins admin: per-row pin/unpin (featured), manifest re-fetch button, **webhook replay** button (re-ingests upstream latest release via owner's OAuth token), status filter tabs, **bulk select with approve / reject / delete bar**.
- Plugin patch endpoint accepts `ownerId` for admin-driven transfer; `POST /api/plugins/:slug/transfer` for owner-driven transfer.
- Users page: quick promote/demote + edit modal (displayName + role).
- Audit log page (`/admin/audit`) — last 200 entries with action/target/actor/IP.
- **Audit hooks wired across every admin mutation** (providers create/update/delete/logo, branding, pages CRUD, instance, infra cache/storage, users role/displayName, setup complete, plugin status/delete/rehash/refresh-manifest, plugin bulk, plugin replay-webhook, plugin transfer).
- `POST /api/admin/plugins/bulk` for batched approve/reject/delete (100/call cap).
- `POST /api/admin/plugins/:id/replay-webhook` for manual re-ingest.
- GitLab webhook URL conventions verified — REST path `/api/v4/projects/:id/hooks` + UI path `/:owner/:repo/-/hooks` are CE/EE standard, no fix needed.

**Customization**
- Branding extended: `accentHex`, `successHex`, `footerText`, `analyticsScript` (HTML, head-injected), `allowIndexing` (drives `<meta name="robots">` + `/robots.txt`).
- Admin branding page: split into Identity / Colors / Images / Footer + SEO sections.
- `/robots.txt` served from settings.

**Security / correctness**
- `GET /healthz` with DB + cache + storage probes (503 on degraded).
- Submit endpoint rate-limited (`submit` bucket, 10/h default).
- `DELETE /auth/me` for account deletion (refuses if user owns plugins, requires transfer/delete first).
- Audit log infrastructure ready for hooking into more actions.

**DB drivers**
- `DATABASE_URL` scheme picks dialect at boot: `sqlite:…` / `postgres://…` / `mysql://…`.
- Three schema files mirroring each other column-for-column (`schema.ts` / `schema.pg.ts` / `schema.mysql.ts`).
- Three drizzle configs (`drizzle.config.ts`, `drizzle.pg.config.ts`, `drizzle.mysql.config.ts`).
- `bun run generate` / `generate:pg` / `generate:mysql` scripts.
- Boot dispatches the right migrator + drizzle client; healthz reflects this.
- `@tabularium/*` workspace rename completed in earlier sprint.

## Pending / next sprints

**Dogfood**
- First real plugins for the catalog (database adapters) — exercises the multi-dialect path end-to-end. Probably worth a `seed-plugins.ts` that submits via the same `/api/submit/oauth` path the public uses.

**Job queue (deferred until needed)**
- Only when async work outgrows `queueMicrotask` (huge SHA256 hashing, asset mirroring later). Adapter shape from previous sprint's TODO still applies.

**Plugin stats (downloads + popularity)**
- Per-plugin download counter — increment on `/api/plugins/:slug/latest` resolution and on direct asset hits (when asset mirroring lands, count from our domain; until then, accept a webhook/ping from the user's runtime or count `latest`-redirect hits).
- Per-release download breakdown (so we can see which versions are sticky vs. dead).
- Time-bucketed counters (last-7d / last-30d / all-time) — cheap impl: monotonic total + daily snapshot row, derive deltas at read time.
- Expose on `GET /api/plugins/:slug` (`downloads: { total, last7d, last30d }`) and surface as a sortable `?sort=popular` on the list endpoint + a "Popular" widget option.
- Admin view shows per-plugin/per-release counts; consider exporting CSV for plugin authors.
- Bot/abuse mitigation: bucket by IP+UA hash with a short TTL (`cache.incr` on `dl:<slug>:<ip-hash>:<day>` → drop if already counted).

**Kleinkram**
- E2E test pass with `@testing-library/svelte` + `bun:test`.
- Asset mirroring: when SHA256 verified, copy asset into our object storage and serve from our domain.
- Transfer-acceptance flow (recipient confirms before ownership moves) — current `POST /api/plugins/:slug/transfer` is one-step.
