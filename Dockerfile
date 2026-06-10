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
# The api ships a vendored TurboSMTP SDK as a tgz inside its workspace dir
# and pins it via "turbosmtp": "./vendor/turbosmtp-0.1.0.tgz". Bun resolves
# file: URLs at install time, so the tgz must be in the context before
# `bun install` runs — otherwise the build dies with "ENOENT extracting
# tarball from turbosmtp".
COPY apps/api/vendor ./apps/api/vendor

RUN bun install --frozen-lockfile

COPY . .

# Build the manifest workspace package before the frontend so its dist/
# is available — `@tabularium/manifest`'s package.json points "main" at
# ./dist/index.js (so it publishes cleanly to npm), and `apps/api` imports
# from it at runtime via that resolution.
RUN cd packages/manifest && bun run build
RUN cd apps/frontend && bun run build

FROM docker.io/oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS prod-deps

WORKDIR /repo

COPY apps/api/package.json ./apps/api/
COPY apps/api/vendor ./apps/api/vendor
COPY packages/manifest/package.json ./packages/manifest/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Synthesize a slim root package.json that only references the API + manifest
# (publishable runtime dep). Drop devDependencies, the frontend, CLI, and
# `@tabularium/client` workspaces — none of them are imported by the API at
# runtime, and shipping them just enlarges node_modules + attack surface.
#
# Trade-off: --no-save (not --frozen-lockfile) because the root bun.lock was
# resolved against the full workspace set (apps/*, packages/*); reusing it
# here would fail validation. Direct deps in apps/api/package.json +
# packages/manifest/package.json are pinned with caret ranges so resolution
# is bounded — but a transitive minor bump can land between builds. If you
# need byte-for-byte reproducibility, build with a fixed image tag + Renovate.
RUN printf '%s\n' \
  '{' \
  '  "name": "@tabularium/registry",' \
  '  "private": true,' \
  '  "type": "module",' \
  '  "workspaces": ["apps/api", "packages/manifest", "packages/tsconfig"],' \
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
          -o -name 'CONTRIBUTING*' -o -name 'SECURITY*' \
          -o -name 'THIRD-PARTY-NOTICES*' \) \
       -delete \
  # Prune test/example dirs across all packages.
  && find node_modules -type d \
       \( -name 'test' -o -name 'tests' -o -name '__tests__' \
          -o -name 'example' -o -name 'examples' -o -name 'benchmark' \) \
       -prune -exec rm -rf {} + \
  # TypeScript compiler — bun runs TS directly; only kill the canonical
  # install slot rather than glob-purging anything a future dep might pull in.
  && rm -rf node_modules/.bun/typescript@* \
  # Drop unused drizzle-orm dialect adapters; api uses sqlite/mysql2/postgres-js only.
  && for d in node_modules/.bun/drizzle-orm@*/node_modules/drizzle-orm; do \
       cd "$d" && rm -rf \
         arktype aws-data-api better-sqlite3 bun-sql cockroach-core d1 \
         durable-sqlite effect-postgres effect-schema expo-sqlite gel \
         libsql mssql-core mysql-proxy neon neon-http neon-serverless \
         netlify-db node-mssql node-postgres node-sqlite op-sqlite pg-proxy \
         pglite planetscale-serverless prisma singlestore singlestore-core \
         singlestore-proxy sqlite-cloud sqlite-proxy sql-js supabase \
         tidb-serverless tursodatabase typebox typebox-legacy \
         valibot vercel-postgres xata-http || true; cd - >/dev/null; \
     done \
  # Prettier is pulled in by elysia-fsr but only invoked when types: true.
  # Drop plugin bundles + standalone build + CLI internals — never loaded by index.mjs.
  && rm -rf node_modules/.bun/prettier@*/node_modules/prettier/plugins \
            node_modules/.bun/prettier@*/node_modules/prettier/standalone.js \
            node_modules/.bun/prettier@*/node_modules/prettier/standalone.mjs \
            node_modules/.bun/prettier@*/node_modules/prettier/bin \
            node_modules/.bun/prettier@*/node_modules/prettier/internal

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
# wget ships with BusyBox in alpine — only tini + CA roots needed here.
RUN apk add --no-cache tini ca-certificates

# prod-deps brought in node_modules + a bare apps/api/package.json + bare
# packages/*/package.json. Workspace symlinks under node_modules/@tabularium/*
# point at /app/packages/* and /app/apps/api — those dirs are populated below
# by the build-stage src+dist copies. Order matters: the bare package.jsons
# from prod-deps must land before the build-stage source overlays.
COPY --from=prod-deps --chown=app:app /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /repo/package.json ./package.json
COPY --from=prod-deps --chown=app:app /repo/packages ./packages
COPY --from=prod-deps --chown=app:app /repo/apps/api ./apps/api

COPY --from=build --chown=app:app /repo/apps/api/src ./apps/api/src
COPY --from=build --chown=app:app /repo/apps/api/scripts ./apps/api/scripts
COPY --from=build --chown=app:app /repo/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=build --chown=app:app /repo/apps/api/bunfig.toml ./apps/api/bunfig.toml
COPY --from=build --chown=app:app /repo/packages/manifest/src ./packages/manifest/src
COPY --from=build --chown=app:app /repo/packages/manifest/dist ./packages/manifest/dist
COPY --from=build --chown=app:app /repo/apps/frontend/dist ./apps/frontend/dist

RUN mkdir -p /app/apps/api/data && chown -R app:app /app/apps/api/data

USER app
WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_DRIVER=memory
ENV DATABASE_URL="sqlite:./data/registry.db"

EXPOSE 3000

# Hint operators that the sqlite/data dir should be mounted, not baked in.
VOLUME ["/app/apps/api/data"]

# bun handles SIGTERM cleanly via tini; make the contract explicit.
STOPSIGNAL SIGTERM

# --start-period gives cold-boot migrations + cache init breathing room before
# the first liveness check fires.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "src/index.ts"]
