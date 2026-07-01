---
title: "Deploy"
---

# Deploy

## Docker

Production-ready compose snippet with Postgres + Dragonfly:

```yaml
services:
  registry:
    image: ghcr.io/tabularisdb/tabularium:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      JWT_SECRET: ${JWT_SECRET:?run: openssl rand -hex 32}
      TOKEN_ENC_KEY: ${TOKEN_ENC_KEY:?run: openssl rand -hex 32}
      BASE_URL: "https://registry.example.com"
      DATA_DIR: "/data"
      DATABASE_URL: "postgres://registry:registry@postgres:5432/registry"
      CACHE_DRIVER: "redis"
      REDIS_URL: "redis://dragonfly:6379"
    volumes:
      - ./tabularium-data:/data
    depends_on:
      postgres: { condition: service_healthy }

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: registry
      POSTGRES_PASSWORD: registry
      POSTGRES_DB: registry
    volumes:
      - ./pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U registry"]
      interval: 5s

  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    restart: unless-stopped
    command: --proactor_threads=2
```

Before `docker compose up -d`, create the host folders so the bind mounts have something to attach to:

```bash
mkdir -p ./tabularium-data ./pgdata
```

`./tabularium-data` holds the auto-generated `bootstrap-password`, `config.json`, the SQLite DB (if you ever switch), and `uploads/`. Back it up with the database.

## Env vars

Required:

| Var | Notes |
|-----|-------|
| `JWT_SECRET` | ≥32 chars; must not be the placeholder `change-me-in-production`. |
| `TOKEN_ENC_KEY` | Exactly 64 hex chars (AES-256-GCM at-rest key for stored OAuth tokens and encrypted settings). |
| `BASE_URL` | `http(s)://…` — public origin; used in OAuth callbacks and webhook URLs. |

Optional:

| Var | Default | Notes |
|-----|---------|-------|
| `WEB_BASE_URL` | `BASE_URL` | Separate origin for the frontend SPA if hosted elsewhere. |
| `ALLOWED_ORIGINS` | — | Comma-separated extra CORS origins. `BASE_URL` and `WEB_BASE_URL` are always allowed. |
| `DATA_DIR` | `./data` | Container path for the SQLite DB, uploads, `bootstrap-password`, `config.json`. Point this at the persistent volume. |
| `DATABASE_URL` | — | Normally set via install wizard. Scheme picks the dialect (`sqlite:` / `postgres://` / `mysql://`). |
| `BOOTSTRAP_PASSWORD` | (auto-generated) | Pins the first-run admin password. If unset, a random one is generated and written to `$DATA_DIR/bootstrap-password` (mode 0600). |
| `CACHE_DRIVER` | `memory` | `memory`, `redis`, or `off`. |
| `REDIS_URL` | — | Required when `CACHE_DRIVER=redis`. `redis://…` or `rediss://…`. |
| `NODE_ENV` | `development` | `development` / `production` / `test`. |
| `PORT` | `3000` | |
| `LOG_LEVEL` | `info` | |

## TLS

Terminate TLS at a reverse proxy and forward to port 3000. Caddy is one line:

```
registry.example.com {
  reverse_proxy localhost:3000
}
```

The container serves the SPA, API (`/api`), OAuth callbacks (`/auth`), OpenAPI (`/openapi`), and uploads (`/uploads`) all under `/`. No path-based routing needed.

## Backups

Snapshot `DATA_DIR` (`config.json`, SQLite DB if used, `uploads/`, `bootstrap-password`) plus — for Postgres/MySQL deployments — the external database. The `uploads/` directory holds branding assets and provider logos.
