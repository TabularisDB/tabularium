# ![Tabularium](assets/wordmark.svg)

> Registry di plugin self-hosted. Costruito con [Bun](https://bun.sh), [Elysia](https://elysiajs.com), [SvelteKit](https://kit.svelte.dev) e [Drizzle ORM](https://orm.drizzle.team).

🌐 **Nella tua lingua:** [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh-CN.md)

📚 **Documentazione:** [tabularium.wiki](https://tabularium.wiki)

---

## Cos'è Tabularium?

Una directory di plugin (o di qualsiasi artefatto distribuito via release) con UI web, flusso di submission OAuth, superficie OpenAPI e CMS integrato. Gli autori collegano il loro account GitHub / GitLab / Gitea, scelgono un repo e Tabularium installa il webhook delle release — ogni nuovo tag diventa una release nel registry.

## Caratteristiche

- 🧩 **Submission multi-provider** — GitHub, GitLab, Gitea, Forgejo (qualsiasi istanza), con anteprima del manifest alla selezione del repo
- 🔐 **Release firmate** — ogni release ingerita viene hashata (SHA-256) e firmata con la chiave Ed25519 del registry; JWKS su `/.well-known/registry-key.json`. Le attestation di build-provenance di GitHub vengono inoltrate quando presenti.
- 📨 **Richieste di plugin** — gli utenti possono richiedere plugin, votarli e reclamarli su `/requests` (disattivabile)
- 🔁 **Trasferimenti di plugin** — i proprietari possono trasferire la titolarità di un plugin tra account da `/settings`
- 🌐 **README multilingua** — il campo `readmes:` del manifest mappa lingue a percorsi di README; il registry serve il README corrispondente via `?locale=`
- 📱 **Handoff verso app desktop** — gli operatori possono registrare schemi URL tipo `tabularis://`; la pagina di dettaglio del plugin mostra una CTA "Apri nell'app"
- 🏷 **Tipi di plugin** — tassonomia definita dall'admin (temi, snippet, template SQL, …) con sottopagine pubbliche opt-in per tipo
- 🪄 **Wizard di installazione** — form DB strutturato (host/porta/utente/password + test di connessione), password bootstrap nei log, login automatico in `/admin` dopo il riavvio
- 📝 **CMS integrato** — pagine markdown con widget e traduzioni per lingua
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
cd apps/api && bun --hot src/index.ts

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
  manifest/        @tabularium/manifest — validatore puro + primitive di integrità
  cli/             @tabularium/cli — `tabularium validate` lato autore
  tsconfig/        tsconfig condiviso
deploy/            manifest k3s + script di build dell'immagine
docs/              contenuti Docsify (guide integrity, deploy, ecc.)
.forgejo/          Workflow Codeberg Forgejo Actions
```

## Documentazione

Docs completi su **[tabularium.wiki](https://tabularium.wiki)**.

- 🚀 **[Guida al deploy](https://tabularium.wiki/docs/#/deploy)** — Docker, variabili, reverse proxy
- 🛠 **[Internals del wizard](https://tabularium.wiki/docs/#/install-wizard)**
- 🔌 **[Riferimento API](https://tabularium.wiki/docs/#/api)** — spec OpenAPI su `/openapi/json`

## Licenza

Apache 2.0 — vedi [LICENSE](LICENSE).

## Contribuire

Issue e PR benvenute su [Codeberg](https://codeberg.org/NewtTheWolf/Tabularium). Per modifiche grandi, apri prima una discussion.
