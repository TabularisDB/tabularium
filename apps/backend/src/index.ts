import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'
import staticPlugin from '@elysiajs/static'
import { cors } from '@elysiajs/cors'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'
import { env, allowedOrigins } from '$lib/env'
import { db, dialect } from '$db'
import { logger } from '$lib/logger'
import { loggerMiddleware } from '$middleware/logger'
import { initSettings } from '$lib/settings'
import { initProviderInstances, listEnabledInstances } from '$lib/provider-instance'
import { initCache } from '$lib/cache'
import { initStorage, diskUploadsRoot } from '$lib/storage'
import { mkdir } from 'node:fs/promises'

// 1. Apply migrations (idempotent — drizzle skips already-applied).
async function applyMigrations() {
  const migrationsFolder = resolve(`./src/db/migrations.${dialect === 'sqlite' ? 'sqlite' : dialect}`)
  if (dialect === 'pg') {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder })
    return
  }
  if (dialect === 'mysql') {
    const { migrate } = await import('drizzle-orm/mysql2/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder })
    return
  }
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  migrate(db as any, { migrationsFolder: resolve('./src/db/migrations') })
}
await applyMigrations()

await initSettings()
initCache()
initStorage()
await mkdir(diskUploadsRoot(), { recursive: true })
await initProviderInstances()

if (listEnabledInstances().length === 0) {
  logger.warn('No provider instances configured — admin should add at least one via /admin')
}

const corsOrigins = allowedOrigins()
logger.info({ module: 'boot', origins: corsOrigins }, 'CORS allowed origins')

const app = new Elysia({ systemRouter: false })
  .use(loggerMiddleware)
  .use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Hub-Signature-256', 'X-Gitlab-Token', 'X-Gitea-Signature'],
      exposeHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  )
  .use(
    openapi({
      documentation: {
        info: {
          title: 'Pluggr API',
          version: '1.0.0',
          description: [
            'Pluggr — index, submit, and discover plugins.',
            '',
            '**How it works**',
            '- Admin configures one or more provider instances (GitHub, GitLab, GitHub Enterprise,',
            '  self-hosted GitLab, Codeberg, Forgejo …).',
            '- End users sign in with any enabled instance via OAuth.',
            '- Releases are pushed via a release-event webhook so clients always see the latest',
            '  version without Pluggr hosting the artifacts.',
          ].join('\n'),
          contact: { name: 'Pluggr' },
          license: { name: 'Apache-2.0' },
        },
        servers: [{ url: 'http://localhost:3000', description: 'Local dev' }],
        tags: [
          { name: 'Plugins', description: 'Browse and inspect indexed plugins.' },
          { name: 'Auth', description: 'OAuth + email/password sign-in.' },
          { name: 'Submit', description: 'Register a new plugin via OAuth.' },
          { name: 'Webhooks', description: 'Release-event ingestion.' },
          { name: 'Requests', description: 'Community-driven plugin wish list.' },
          { name: 'Admin', description: 'Provider instances, settings, users (admin only).' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
            cookieAuth: {
              type: 'apiKey',
              in: 'cookie',
              name: 'auth',
            },
          },
        },
      },
    }),
  )
  .use(await fileRouter({ dir: resolve('./src/routes'), types: false }))
  .use(staticPlugin({ assets: diskUploadsRoot(), prefix: '/uploads', alwaysStatic: false, noCache: false }))
  .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/' }))
  .get('/*', ({ path, set }) => {
    if (path.startsWith('/api') || path.startsWith('/auth') || path.startsWith('/openapi') || path.startsWith('/uploads')) {
      set.status = 404
      return { error: 'Not found' }
    }
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return Bun.file(resolve('../frontend/dist/index.html'))
  })
  .listen(Number(env.PORT ?? 3000))

const port = app.server?.port
logger.info({ module: 'boot', port }, `pluggr running on http://localhost:${port}`)
logger.info({ module: 'boot' }, `OpenAPI spec: http://localhost:${port}/openapi/json`)
logger.info({ module: 'boot' }, `OpenAPI UI:   http://localhost:${port}/openapi`)

export type App = typeof app
