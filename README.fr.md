# ![Tabularium](assets/wordmark.svg)

> Registre de plugins auto-hébergé. Construit avec [Bun](https://bun.sh), [Elysia](https://elysiajs.com), [SvelteKit](https://kit.svelte.dev) et [Drizzle ORM](https://orm.drizzle.team).

🌐 **Dans ta langue :** [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh-CN.md)

📚 **Documentation :** [tabularium.wiki](https://tabularium.wiki)

---

## C'est quoi Tabularium ?

Un annuaire de plugins (ou tout artefact diffusé via releases) avec interface web, flux de soumission OAuth, surface OpenAPI et CMS intégré. Les auteurs connectent leur compte GitHub / GitLab / Gitea, choisissent un dépôt, et Tabularium installe le webhook de release — chaque nouveau tag devient une release dans le registre.

## Fonctionnalités

- 🧩 **Soumission multi-fournisseurs** — GitHub, GitLab, Gitea, Forgejo (toute instance), avec aperçu du manifest à la sélection du dépôt
- 🔐 **Releases signées** — chaque release ingérée est hashée (SHA-256) et signée avec la clé Ed25519 du registre ; JWKS sur `/.well-known/registry-key.json`. Les attestations de build-provenance GitHub sont relayées quand elles sont présentes.
- 📨 **Demandes de plugin** — les utilisateurs peuvent demander des plugins, voter et les revendiquer sur `/requests` (désactivable)
- 🔁 **Transferts de plugin** — les propriétaires peuvent transférer la propriété d'un plugin entre comptes depuis `/settings`
- 🌐 **READMEs multi-langues** — le champ `readmes:` du manifest associe des langues à des chemins de README ; le registre sert le README correspondant via `?locale=`
- 📱 **Handoff vers app desktop** — les opérateurs peuvent enregistrer des schémas d'URL type `tabularis://` ; la page de détail du plugin expose un CTA « Ouvrir dans l'app »
- 🏷 **Types de plugin** — taxonomie définie par l'admin (thèmes, snippets, modèles SQL, …) avec sous-pages publiques optionnelles par type
- 🪄 **Assistant d'installation** — formulaire de BDD structuré (hôte/port/utilisateur/mot de passe + test de connexion), mot de passe bootstrap dans les logs, connexion automatique à `/admin` après redémarrage
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
cd apps/api && bun --hot src/index.ts

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
  manifest/        @tabularium/manifest — validateur pur + primitives d'intégrité
  cli/             @tabularium/cli — `tabularium validate` côté auteur
  tsconfig/        tsconfig partagé
deploy/            manifests k3s + script de build d'image
docs/              contenu Docsify (guides d'intégrité, déploiement, etc.)
.forgejo/          Workflows Codeberg Forgejo Actions
```

## Documentation

Docs complets sur **[tabularium.wiki](https://tabularium.wiki)**.

- 🚀 **[Guide de déploiement](https://tabularium.wiki/docs/#/deploy)** — Docker, variables, reverse proxy
- 🛠 **[Internals de l'assistant](https://tabularium.wiki/docs/#/install-wizard)**
- 🔌 **[Référence API](https://tabularium.wiki/docs/#/api)** — spec OpenAPI sur `/openapi/json`

## Licence

Apache 2.0 — voir [LICENSE](LICENSE).

## Contribuer

Issues et PRs bienvenues sur [Codeberg](https://codeberg.org/NewtTheWolf/Tabularium). Pour les changements importants, ouvre une discussion d'abord.
