# Tabularium

> Registry di plugin self-hosted per l'ecosistema **TabularisDB**. Costruito con [Bun](https://bun.sh), [Elysia](https://elysiajs.com), [SvelteKit](https://kit.svelte.dev) e [Drizzle ORM](https://orm.drizzle.team).

🌐 **Nella tua lingua:** [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh-CN.md)

📚 **Documentazione:** [docs Tabularium](docs/) (Docsify, distribuibile su Codeberg Pages / git-pages.org)

---

## Cos'è Tabularium?

Una directory di plugin (o di qualsiasi artefatto distribuito via release) con UI web, flusso di submission OAuth, superficie OpenAPI e CMS integrato. Gli autori collegano il loro account GitHub / GitLab / Gitea, scelgono un repo e Tabularium installa il webhook delle release — ogni nuovo tag diventa una release nel registry.

## Caratteristiche

- 🧩 **Submission multi-provider** — GitHub, GitLab, Gitea (qualsiasi istanza)
- 🪄 **Wizard di installazione** — form DB strutturato (host/porta/utente/password + test di connessione), password bootstrap nei log, login automatico in `/admin` dopo il riavvio
- 📝 **CMS integrato** — pagine markdown con widget e traduzioni per lingua
- 🏷 **Tipi di plugin** — tassonomia definita dall'admin (temi, snippet, template SQL, …) consumata dalle app utente come filtri
- 🎨 **Branding** — nome, colori, logo, favicon, analytics, policy di indicizzazione
- 🌍 **6 lingue** — English, Deutsch, Español, Français, Italiano, 中文 — configurabile dall'admin
- 🗄 **Multi-dialetto** — SQLite, Postgres o MySQL (auto-rilevato da `DATABASE_URL`)
- 🚦 **Feature toggle** — disattiva submission o richieste senza redeploy
- 🪵 **Audit log** — ogni azione admin con autore + IP + target

## Avvio rapido

```bash
git clone https://codeberg.org/NewtTheWolf/Tabularium
cd Tabularium
bun install
docker compose -f compose.dev.yml up -d   # postgres + dragonfly (opzionale)

# terminale 1
cd apps/backend && bun --hot src/index.ts

# terminale 2
cd apps/frontend && bun dev
```

Apri `http://localhost:5180` — il wizard ti guida nella configurazione del database, esegue le migration, semina le pagine CMS di default e promuove l'account bootstrap ad admin reale.

La password bootstrap viene stampata al primo avvio:

```
==========================================
 Tabularium install wizard
 → http://localhost:3000/welcome
 Bootstrap login:
   admin@example.com
   <password-auto-generata>
==========================================
```

## Stack

| Layer | Tech |
|-------|------|
| Runtime | [Bun](https://bun.sh) (≥ 1.3) |
| HTTP | [Elysia](https://elysiajs.com) + TypeBox |
| DB | [Drizzle ORM](https://orm.drizzle.team) — sqlite / postgres-js / mysql2 |
| Cache | `Bun.redis` (compatibile con Dragonfly) o in memoria |
| Frontend | SvelteKit (SPA) + [Eden Treaty](https://elysiajs.com/eden/treaty/overview) tipi end-to-end |
| i18n | [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) |
| Docs | [Docsify](https://docsify.js.org) — nessuno step di build |

## Struttura

```
apps/
  backend/         API Elysia + wizard di installazione
  frontend/        SPA SvelteKit
packages/
  client/          @tabularium/client — client Eden Treaty tipizzato
  tsconfig/        tsconfig condiviso
docs/              Docsify (distribuibile così com'è)
.forgejo/          Workflow Codeberg Forgejo Actions
```

## Documentazione

- 📖 **[Docs locali](docs/)** — apri `docs/index.html` o `bunx docsify-cli serve docs`
- 🚀 **[Guida al deploy](docs/deploy.md)** — Docker, variabili, reverse proxy
- 🛠 **[Internals del wizard](docs/install-wizard.md)**
- 🔌 **[Riferimento API](docs/api.md)** — spec OpenAPI su `/openapi/json`
- 🌐 **[Deploy su Codeberg Pages](docs/deploy-docs.md)** — pubblica i docs da questo repo

## Licenza

MIT — vedi [LICENSE](LICENSE).

## Contribuire

Issue e PR benvenute su [Codeberg](https://codeberg.org/NewtTheWolf/Tabularium). Per modifiche grandi, apri prima una discussion.
