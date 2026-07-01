---
title: "Tabularium documentation"
---

# Tabularium documentation

Tabularium is a self-hosted plugin registry, part of the TabularisDB ecosystem.

## What is it

Tabularium hosts a directory of plugins (or any GitHub/GitLab/Gitea release-shipping artefact) behind a web UI and a typed JSON API. Authors submit their repo through OAuth; Tabularium installs a release webhook and indexes new versions automatically.

## Features

- **Multi-provider submission** — GitHub, GitLab, Gitea (instances are configurable per registry).
- **Cold-start install wizard** — first boot prints a bootstrap admin password, then guides the operator through database choice.
- **CMS** — admin-managed markdown pages for `/`, `/plugins`, `/requests`, the footer, and arbitrary routes.
- **Branding** — name, colours, logo, favicon, analytics snippet, robots policy.
- **Feature toggles** — disable submissions or requests temporarily without redeploy.
- **i18n** — 6 UI languages (English, Deutsch, Español, Français, Italiano, 中文). Default language and enabled set are admin-configurable. CMS pages support per-locale translations with default-locale fallback.
- **Multi-dialect** — runs on SQLite (default), Postgres or MySQL. Same schema, three migration sets.
- **Audit log** — every admin mutation is logged with actor, IP, target.

## Stack

- Backend: [Elysia](https://elysiajs.com) on Bun, Drizzle ORM, postgres-js / mysql2 / bun:sqlite
- Frontend: SvelteKit (SPA) + Eden Treaty + Paraglide JS
- Cache: Bun.redis (Dragonfly-compatible) or in-memory
- Docs: [Sveltepress](https://sveltepress.site) (SvelteKit), deployed on Vercel

## Quick start

```bash
git clone <your-fork>
cd tabularium
bun install
docker compose -f compose.dev.yml up -d   # postgres + dragonfly
cd apps/api && bun --hot src/index.ts
# in another shell:
cd apps/frontend && bun dev
# open http://localhost:5180 → install wizard
```

The backend writes a bootstrap admin password to `apps/api/data/bootstrap-password` on first boot. Sign in at `/login` with `admin@example.com` + that password to walk through setup.

See **[Install](/install/)** for production deploys.
