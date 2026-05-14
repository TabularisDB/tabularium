# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3-alpine AS build

WORKDIR /repo

COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/client/package.json ./packages/client/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY vendor ./vendor

RUN bun install --frozen-lockfile

COPY . .

RUN cd apps/frontend && bun run build

FROM oven/bun:1.3-alpine AS prod-deps

WORKDIR /repo

COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/client/package.json ./packages/client/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY vendor ./vendor

RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3-alpine AS runtime

WORKDIR /app

RUN addgroup -S app && adduser -S -G app app
RUN apk add --no-cache tini ca-certificates wget

COPY --from=build --chown=app:app /repo/apps/api ./apps/api
COPY --from=build --chown=app:app /repo/apps/frontend/dist ./apps/frontend/dist
COPY --from=build --chown=app:app /repo/packages ./packages
COPY --from=build --chown=app:app /repo/vendor ./vendor
COPY --from=build --chown=app:app /repo/package.json /repo/bun.lock /repo/turbo.json ./
COPY --from=prod-deps --chown=app:app /repo/node_modules ./node_modules

RUN mkdir -p /app/apps/api/data && chown -R app:app /app/apps/api/data

USER app
WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_DRIVER=memory
ENV DATABASE_URL="sqlite:./data/registry.sqlite"

EXPOSE 3000

VOLUME ["/app/apps/api/data"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "src/index.ts"]
