# syntax=docker/dockerfile:1.7

FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY vendor ./vendor

RUN bun install --frozen-lockfile

COPY apps ./apps

RUN cd apps/frontend && bun run build

# ---- Runtime ----
FROM oven/bun:1 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL=/data/registry.db

COPY --from=builder /app /app

RUN groupadd -r app && useradd -r -g app -d /app -s /usr/sbin/nologin app \
 && mkdir -p /data \
 && chown -R app:app /app /data

USER app
WORKDIR /app/apps/api

EXPOSE 3000

CMD ["sh", "-c", "bun src/db/migrate.ts && bun src/index.ts"]
