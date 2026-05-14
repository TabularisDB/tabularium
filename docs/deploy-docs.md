# Deploying these docs

This site is built with [Docsify](https://docsify.js.org) — there's no compile step, the `docs/` folder *is* the deployable artefact. Any static host works.

## Codeberg Pages (Forgejo)

Codeberg serves a repository's `pages` branch (or a `pages` repo) at `https://<user>.codeberg.page/<repo>/`. The shipped workflow at `.forgejo/workflows/docs.yml` does the sync automatically on push to `main`:

1. Push to `main` with changes under `docs/`.
2. Forgejo Actions checks out, copies `docs/` to the root of a fresh `pages` branch, force-pushes it.
3. Codeberg Pages serves the new content within ~minutes.

Enable Forgejo Actions on the repo (settings → Advanced settings → Enable Forgejo Actions) and grant the workflow `actions: write` + `contents: write`.

## git-pages.org

[git-pages.org](https://git-pages.org) is a free service that publishes any git repo as a static site. After registering, point it at your repo and set the source path to `docs/`. No workflow needed — git-pages.org pulls directly.

## Generic static host

Drop the `docs/` folder onto:

- Netlify / Vercel / Cloudflare Pages — set the publish directory to `docs`, skip the build command.
- nginx / Caddy — `root /var/www/tabularium/docs; try_files $uri $uri/ /index.html;`
- GitHub Pages — push `docs/` to a `gh-pages` branch.

## Local preview

```bash
cd docs
bunx docsify-cli serve .
```

Open http://localhost:3000.

## i18n

Per-language docs live in `docs/<locale>/` (e.g. `docs/de/`, `docs/zh-CN/`). Docsify resolves them automatically via the [language fallback config](https://docsify.js.org/#/language-highlight) in `index.html`. To add a translation, copy a section and translate the markdown — no code changes.
