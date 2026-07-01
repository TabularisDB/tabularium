---
title: "Install"
---

# Install

The fastest way to run Tabularium is the published Docker image. SQLite-backed, no extra services required.

## Quick start

```bash
mkdir -p ./tabularium-data
export JWT_SECRET=$(openssl rand -hex 32)
export TOKEN_ENC_KEY=$(openssl rand -hex 32)
docker compose up -d
```

with this `docker-compose.yml`:

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
      BASE_URL: "http://localhost:3000"
      DATA_DIR: "/data"
    volumes:
      - ./tabularium-data:/data
```

Open <http://localhost:3000>. On first boot the registry generates a bootstrap password and writes it to `./tabularium-data/bootstrap-password`:

```bash
cat ./tabularium-data/bootstrap-password
```

Sign in at `/login` with `admin@example.com` + that password. The install wizard then asks for a database URL, seeds default CMS pages, and restarts.

## Required env

| Var | Notes |
|-----|-------|
| `JWT_SECRET` | ≥32 chars |
| `TOKEN_ENC_KEY` | exactly 64 hex chars (AES-256-GCM at-rest key) |
| `BASE_URL` | `http(s)://…` — public origin, used in OAuth callbacks and webhook URLs |

Everything else is optional. See [Deploy → Env vars](/deploy/) for the full list.

## If you want…

### …to pin the bootstrap password

Set `BOOTSTRAP_PASSWORD` in the environment. The registry then uses that value instead of generating one, and no file is written.

### …Postgres or MySQL instead of SQLite

Configure the database via the install wizard, or pre-seed `DATABASE_URL`:

| Dialect | URL form |
|---------|----------|
| SQLite (default) | `sqlite:/data/registry.sqlite` |
| Postgres | `postgres://user:pass@host:5432/db` |
| MySQL | `mysql://user:pass@host:3306/db` |

The dialect is detected from the scheme; migrations run on first connect.

### …multi-replica deployments

Switch the cache to Redis (or Dragonfly):

```yaml
environment:
  CACHE_DRIVER: "redis"
  REDIS_URL: "redis://cache:6379"
```

### …updates

```bash
docker compose pull
docker compose up -d
```

The container reads the same `DATA_DIR` on restart and runs any pending migrations.

### …a fresh start

Delete the persisted folder (irreversible):

```bash
docker compose down
rm -rf ./tabularium-data
```

Or just delete the wizard lock to keep the database but re-run the wizard:

```bash
docker compose exec registry rm /data/config.json
docker compose restart
```

## Building from source

```bash
git clone https://github.com/TabularisDB/tabularium
cd Tabularium
bun install
docker compose -f compose.dev.yml up -d   # Postgres + Dragonfly for dev
cd apps/api && bun --hot src/index.ts &
cd apps/frontend && bun dev               # http://localhost:5180
```

`apps/api/.env` controls runtime configuration in dev — copy from `apps/api/.env.example`.
