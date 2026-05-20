# `@tabularium/frontend`

SvelteKit SPA. Talks to `@tabularium/api` via the typed Eden Treaty client in `packages/client`. i18n through Paraglide JS.

## Develop

```bash
bun install
bun dev          # vite on http://localhost:5180, proxies API to http://localhost:3000
```

The API must be running separately (`cd ../api && bun --hot src/index.ts`). Without it the install wizard / auth flow won't load.

## Build

```bash
bun run build    # static SPA build; the API serves the bundle in production
bun run preview  # local preview of the production build
```

## Check

```bash
bun run check    # svelte-check (paraglide messages compile first)
```

Some pre-existing svelte-check noise lives in `apps/api/src/index.ts` (Elysia type explosion); see `TODO.md` if you trip on it.

## Layout

```
src/
  routes/                 SvelteKit routes (SPA — adapter-static)
    admin/                operator console (instance, providers, plugins, kinds, …)
    plugins/[slug]/       public plugin detail (Open in App handoff, README, releases)
    requests/             plugin request board
    settings/             user identity + plugin transfers
    submit/                guided plugin submission (with manifest preview)
  lib/
    components/           shared UI (Admin*, ConfirmDialog, StickySaveBar, …)
    stores/               instance-info, branding, auth
    paraglide/            generated message functions (do not hand-edit)
```

## i18n

Messages live under `project.inlang/messages/{locale}.json`. Paraglide compiles them into `src/lib/paraglide/` at build time (and on `bun run check`). Add new keys to the EN file first, then mirror.
