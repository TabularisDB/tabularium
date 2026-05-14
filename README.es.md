# ![Tabularium](assets/wordmark.svg)

> Registro de plugins auto-hospedado. Construido con [Bun](https://bun.sh), [Elysia](https://elysiajs.com), [SvelteKit](https://kit.svelte.dev) y [Drizzle ORM](https://orm.drizzle.team).

🌐 **En tu idioma:** [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh-CN.md)

📚 **Documentación:** [tabularium.wiki](https://tabularium.wiki)

---

## ¿Qué es Tabularium?

Un directorio de plugins (o cualquier artefacto que se publique por releases) con UI web, flujo de envío vía OAuth, superficie OpenAPI y CMS integrado. Las autoras conectan su cuenta de GitHub / GitLab / Gitea, eligen un repo y Tabularium instala el webhook de releases automáticamente — cada tag nuevo se convierte en una release en el registro.

## Características

- 🧩 **Envío multi-proveedor** — GitHub, GitLab, Gitea (cualquier instancia)
- 🪄 **Asistente de instalación** — formulario estructurado de BD (host/puerto/usuario/contraseña + probar conexión), contraseña bootstrap impresa en el log, autologin en `/admin` tras el reinicio
- 📝 **CMS integrado** — páginas markdown con widgets y traducciones por idioma
- 🏷 **Tipos de plugin** — taxonomía definida por el admin (temas, snippets, plantillas SQL, …) que las apps consumidoras usan como filtros
- 🎨 **Branding** — nombre, colores, logo, favicon, analítica, política de indexado
- 🌍 **6 idiomas** — English, Deutsch, Español, Français, Italiano, 中文 — configurable por admin
- 🗄 **Multi-dialecto** — SQLite, Postgres o MySQL (auto-detectado vía `DATABASE_URL`)
- 🚦 **Conmutadores de features** — desactivar envíos o solicitudes sin redeploy
- 🪵 **Audit log** — cada acción admin con actor + IP + objetivo

## Inicio rápido

```bash
git clone https://codeberg.org/NewtTheWolf/Tabularium
cd Tabularium
bun install
docker compose -f compose.dev.yml up -d   # postgres + dragonfly (opcional)

# terminal 1
cd apps/api && bun --hot src/index.ts

# terminal 2
cd apps/frontend && bun dev
```

Abre `http://localhost:5180` — el asistente te guía por la configuración de la base de datos, ejecuta las migraciones, siembra páginas CMS por defecto y promueve la cuenta bootstrap a admin real.

La contraseña bootstrap se imprime al primer arranque:

```
==========================================
 Tabularium install wizard
 → http://localhost:3000/welcome
 Bootstrap login:
   admin@example.com
   <contraseña-auto-generada>
==========================================
```

## Stack

| Capa | Tech |
|------|------|
| Runtime | [Bun](https://bun.sh) (≥ 1.3) |
| HTTP | [Elysia](https://elysiajs.com) + TypeBox |
| DB | [Drizzle ORM](https://orm.drizzle.team) — sqlite / postgres-js / mysql2 |
| Caché | `Bun.redis` (compatible con Dragonfly) o en memoria |
| Frontend | SvelteKit (SPA) + [Eden Treaty](https://elysiajs.com/eden/treaty/overview) tipos end-to-end |
| i18n | [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) |
| Docs | [Docsify](https://docsify.js.org) — sin paso de build |

## Estructura

```
apps/
  backend/         API Elysia + asistente de instalación
  frontend/        SPA SvelteKit
packages/
  client/          @tabularium/client — cliente Eden Treaty tipado
  tsconfig/        tsconfig compartido
.forgejo/          Workflows de Codeberg Forgejo Actions
```

## Documentación

Docs completos en **[tabularium.wiki](https://tabularium.wiki)**.

- 🚀 **[Guía de despliegue](https://tabularium.wiki/docs/#/deploy)** — Docker, variables, reverse proxy
- 🛠 **[Internals del wizard](https://tabularium.wiki/docs/#/install-wizard)**
- 🔌 **[Referencia API](https://tabularium.wiki/docs/#/api)** — spec OpenAPI en `/openapi/json`

## Licencia

MIT — ver [LICENSE](LICENSE).

## Contribuir

Issues y PRs bienvenidos en [Codeberg](https://codeberg.org/NewtTheWolf/Tabularium). Para cambios grandes, abre una discusión antes para alinear dirección.
