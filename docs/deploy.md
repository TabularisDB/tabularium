# Deploy

## Docker

A minimal compose file for production-like dev:

```yaml
services:
  tabularium:
    image: oven/bun:1.3-alpine
    working_dir: /app
    volumes:
      - ./:/app
      - data:/app/apps/backend/data
    environment:
      DATABASE_URL: postgres://registry:registry@postgres:5432/registry
      CACHE_DRIVER: redis
      REDIS_URL: redis://dragonfly:6379
      JWT_SECRET: change-me
    command: sh -c "bun install && cd apps/backend && bun src/index.ts"
    ports: ["3000:3000"]
    depends_on: { postgres: { condition: service_healthy } }

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: registry
      POSTGRES_PASSWORD: registry
      POSTGRES_DB: registry
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U registry"]
      interval: 5s

  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    command: --proactor_threads=2

volumes: { pgdata: {}, data: {} }
```

For real deploys, build the SPA ahead of time:

```bash
cd apps/frontend && bun run build
```

…and bake the result into a slimmer container that only carries the backend.

## Env vars

| Var | Required | Default |
|-----|----------|---------|
| `DATABASE_URL` | yes (post-install) | — |
| `JWT_SECRET` | yes | — (refuses to boot without one) |
| `CACHE_DRIVER` | no | `memory` |
| `REDIS_URL` | only if `CACHE_DRIVER=redis` | — |
| `BOOTSTRAP_PASSWORD` | no | auto-generated, printed to logs |
| `PUBLIC_URL` | no | `http://localhost:3000` |
| `UPLOAD_DIR` | no | `./data/uploads` |

## TLS

Run any reverse proxy in front (Caddy is one line):

```
registry.example.com {
  reverse_proxy localhost:3000
}
```

## Backups

Snapshot `apps/backend/data/config.json` + the database. The `data/uploads/` directory holds branding assets and provider logos.
