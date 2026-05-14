# Tabularium

> Registre de plugins auto-hébergé pour l'écosystème **TabularisDB**. Construit avec [Bun](https://bun.sh), [Elysia](https://elysiajs.com), [SvelteKit](https://kit.svelte.dev) et [Drizzle ORM](https://orm.drizzle.team).

🌐 **Dans ta langue :** [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh-CN.md)

📚 **Documentation :** [docs Tabularium](docs/) (Docsify, déployable sur Codeberg Pages / git-pages.org)

---

## C'est quoi Tabularium ?

Un annuaire de plugins (ou tout artefact diffusé via releases) avec interface web, flux de soumission OAuth, surface OpenAPI et CMS intégré. Les auteurs connectent leur compte GitHub / GitLab / Gitea, choisissent un dépôt, et Tabularium installe le webhook de release — chaque nouveau tag devient une release dans le registre.

## Fonctionnalités

- 🧩 **Soumission multi-fournisseurs** — GitHub, GitLab, Gitea (toute instance)
- 🪄 **Assistant d'installation** — démarrage à froid sans base de données, mot de passe bootstrap dans les logs
- 📝 **CMS intégré** — pages markdown avec widgets et traductions par langue
- 🎨 **Branding** — nom, couleurs, logo, favicon, analytics, politique d'indexation
- 🌍 **6 langues** — English, Deutsch, Español, Français, Italiano, 中文 — configurable par l'admin
- 🗄 **Multi-dialecte** — SQLite, Postgres ou MySQL (auto-détecté via `DATABASE_URL`)
- 🚦 **Drapeaux de fonctionnalités** — désactiver les soumissions ou les demandes sans redéploiement
- 🪵 **Journal d'audit** — chaque action admin avec acteur + IP + cible

## Démarrage rapide

```bash
git clone https://codeberg.org/NewtTheWolf/Tabularium
cd Tabularium
bun install
docker compose -f compose.dev.yml up -d   # postgres + dragonfly (optionnel)

# terminal 1
cd apps/backend && bun --hot src/index.ts

# terminal 2
cd apps/frontend && bun dev
```

Ouvre `http://localhost:5180` — l'assistant gère la base de données, lance les migrations, sème les pages CMS par défaut et promeut le compte bootstrap en vrai admin.

Le mot de passe bootstrap est affiché au premier boot :

```
==========================================
 Tabularium install wizard
 → http://localhost:3000/welcome
 Bootstrap login:
   admin@example.com
   <mot-de-passe-auto-généré>
==========================================
```

## Stack

| Couche | Tech |
|--------|------|
| Runtime | [Bun](https://bun.sh) (≥ 1.3) |
| HTTP | [Elysia](https://elysiajs.com) + TypeBox |
| DB | [Drizzle ORM](https://orm.drizzle.team) — sqlite / postgres-js / mysql2 |
| Cache | `Bun.redis` (compatible Dragonfly) ou en mémoire |
| Frontend | SvelteKit (SPA) + [Eden Treaty](https://elysiajs.com/eden/treaty/overview) typage end-to-end |
| i18n | [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) |
| Docs | [Docsify](https://docsify.js.org) — pas d'étape de build |

## Structure

```
apps/
  backend/         API Elysia + assistant d'installation
  frontend/        SPA SvelteKit
packages/
  client/          @tabularium/client — client Eden Treaty typé
  tsconfig/        tsconfig partagé
docs/              Docsify (déployable tel quel)
.forgejo/          Workflows Codeberg Forgejo Actions
```

## Documentation

- 📖 **[Docs locales](docs/)** — ouvre `docs/index.html` ou `bunx docsify-cli serve docs`
- 🚀 **[Guide de déploiement](docs/deploy.md)** — Docker, variables, reverse proxy
- 🛠 **[Internals de l'assistant](docs/install-wizard.md)**
- 🔌 **[Référence API](docs/api.md)** — spec OpenAPI sur `/openapi/json`
- 🌐 **[Déploiement Codeberg Pages](docs/deploy-docs.md)** — publie les docs depuis ce dépôt

## Licence

MIT — voir [LICENSE](LICENSE).

## Contribuer

Issues et PRs bienvenues sur [Codeberg](https://codeberg.org/NewtTheWolf/Tabularium). Pour les changements importants, ouvre une discussion d'abord.
