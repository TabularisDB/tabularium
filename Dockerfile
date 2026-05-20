# syntax=docker/dockerfile:1.7

FROM docker.io/oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build

WORKDIR /repo

COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/client/package.json ./packages/client/
COPY packages/cli/package.json ./packages/cli/
COPY packages/manifest/package.json ./packages/manifest/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN bun install --frozen-lockfile

COPY . .

RUN cd apps/frontend && bun run build

FROM docker.io/oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS prod-deps

WORKDIR /repo

# Root manifest with frontend removed from workspaces so its deps are not installed
COPY apps/api/package.json ./apps/api/
COPY packages/client/package.json ./packages/client/
COPY packages/manifest/package.json ./packages/manifest/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Synthesize a slim root package.json that only references API + runtime
# packages workspaces. Drop devDependencies, the frontend workspace, and the
# CLI workspace (author-side tool, not loaded at runtime).
RUN printf '%s\n' \
  '{' \
  '  "name": "@tabularium/registry",' \
  '  "private": true,' \
  '  "type": "module",' \
  '  "workspaces": ["apps/api", "packages/client", "packages/manifest", "packages/tsconfig"],' \
  '  "overrides": { "elysia": "^1.4.28" },' \
  '  "packageManager": "bun@1.3.12"' \
  '}' > package.json \
  && bun install --production --no-save \
  && rm -rf /root/.bun/install/cache \
  # Prune type-only and dev-only artifacts not loaded by bun at runtime.
  && find node_modules -type f \
       \( -name '*.cjs.map' -o -name '*.js.map' -o -name '*.mjs.map' \
          -o -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' \
          -o -name '*.d.ts.map' -o -name '*.d.cts.map' -o -name '*.d.mts.map' \
          -o -name '*.md' -o -name '*.markdown' \
          -o -name 'CHANGELOG*' -o -name 'HISTORY*' -o -name 'AUTHORS*' \
          -o -name 'CONTRIBUTING*' -o -name 'SECURITY*' \) \
       -delete \
  # TypeScript compiler is a peer dep declared by elysia/api but bun runs TS without it.
  && rm -rf node_modules/.bun/typescript@* \
            node_modules/.bun/node_modules/typescript \
            node_modules/.bun/*/node_modules/typescript \
  # Drop unused drizzle-orm dialect adapters; api uses sqlite/mysql2/postgres-js only.
  && for d in node_modules/.bun/drizzle-orm@*/node_modules/drizzle-orm; do \
       cd "$d" && rm -rf \
         aws-data-api libsql tursodatabase netlify-db \
         singlestore singlestore-core mssql-core effect-postgres \
         cockroach-core sqlite-cloud typebox-legacy typebox \
         mysql-proxy sqlite-proxy xata-http neon-http neon-serverless \
         vercel-postgres planetscale-serverless prisma knex \
         expo-sqlite durable-sqlite better-sqlite3 sql-js sql.js \
         d1 op-sqlite gel pg bun-sql node-postgres pglite \
         tidb-serverless || true; cd - >/dev/null; \
     done \
  # Prettier is pulled in by elysia-fsr but only invoked when types: true.
  # Drop the plugin bundles + standalone build — never loaded by index.mjs.
  && rm -rf node_modules/.bun/prettier@*/node_modules/prettier/plugins \
            node_modules/.bun/prettier@*/node_modules/prettier/standalone.js \
            node_modules/.bun/prettier@*/node_modules/prettier/standalone.mjs

FROM docker.io/oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime

ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown

LABEL org.opencontainers.image.title="Tabularium Registry" \
      org.opencontainers.image.description="Plugin registry for the Tabularium platform — index, submit, and discover plugins." \
      org.opencontainers.image.source="https://codeberg.org/Tabularium/Tabularium" \
      org.opencontainers.image.url="https://tabularium.wiki" \
      org.opencontainers.image.documentation="https://tabularium.wiki/docs/#/install" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Tabularium" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION" \
      org.opencontainers.image.created="$CREATED" \
      org.opencontainers.image.authors="Tabularium contributors"

WORKDIR /app

RUN addgroup -S app && adduser -S -G app app
RUN apk add --no-cache tini ca-certificates wget

COPY --from=prod-deps --chown=app:app /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /repo/package.json ./package.json
COPY --from=prod-deps --chown=app:app /repo/packages ./packages
COPY --from=prod-deps --chown=app:app /repo/apps/api ./apps/api

COPY --from=build --chown=app:app /repo/apps/api/src ./apps/api/src
COPY --from=build --chown=app:app /repo/apps/api/scripts ./apps/api/scripts
COPY --from=build --chown=app:app /repo/apps/api/index.ts ./apps/api/index.ts
COPY --from=build --chown=app:app /repo/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=build --chown=app:app /repo/apps/api/bunfig.toml ./apps/api/bunfig.toml
COPY --from=build --chown=app:app /repo/packages/manifest/src ./packages/manifest/src
COPY --from=build --chown=app:app /repo/apps/frontend/dist ./apps/frontend/dist

RUN mkdir -p /app/apps/api/data && chown -R app:app /app/apps/api/data

USER app
WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_DRIVER=memory
ENV DATABASE_URL="sqlite:./data/registry.sqlite"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "src/index.ts"]
