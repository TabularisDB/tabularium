import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'
import staticPlugin from '@elysiajs/static'
import { cors } from '@elysiajs/cors'
import { fsr } from 'elysia-fsr'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

import { env, allowedOrigins } from '$lib/env'
import { loadConfig } from '$lib/config-file'
import { logger } from '$lib/logger'
import { loggerMiddleware } from '$middleware/logger'

const config = await loadConfig()
const port = Number(env.PORT ?? 3000)
const corsOrigins = allowedOrigins()

export async function createApp() {
  // elysia-fsr resolves `dir` relative to `dirname(Bun.main)` (this file),
  // not the process cwd. So `./routes` here = `apps/api/src/routes`.
  const router = await fsr({ dir: './routes', types: false })
  const base = new Elysia({ systemRouter: false })
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
            title: 'Tabularium API',
            version: '1.0.0',
            description: 'Tabularium — index, submit, and discover plugins.',
            contact: { name: 'Tabularium' },
            license: { name: 'Apache-2.0' },
          },
          servers: [{ url: env.BASE_URL, description: env.NODE_ENV === 'production' ? 'Production' : 'Local dev' }],
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
              bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
              cookieAuth: { type: 'apiKey', in: 'cookie', name: 'auth' },
            },
          },
        },
      }),
    )
    .mapResponse({ as: 'global' }, async ({ request, response }) => {
      const url = new URL(request.url)
      if (url.pathname !== '/openapi/json') return
      if (!(response instanceof Response)) return
      try {
        const spec = (await response.clone().json()) as {
          paths?: Record<string, unknown>
          tags?: Array<{ name: string }>
        }
        const filteredPaths: Record<string, unknown> = {}
        for (const [p, v] of Object.entries(spec.paths ?? {})) {
          if (p.includes('/admin/') || p.includes('/init/') || p.includes('/uploads/') || p === '/*') continue
          filteredPaths[p] = v
        }
        const filtered = {
          ...spec,
          paths: filteredPaths,
          tags: Array.isArray(spec.tags) ? spec.tags.filter((t) => t.name !== 'Admin') : spec.tags,
        }
        return new Response(JSON.stringify(filtered), {
          status: response.status,
          headers: response.headers,
        })
      } catch {
        return
      }
    })
    .use(router)

  if (config.installed) {
    const { diskUploadsRoot } = await import('$lib/storage')
    return base
      .use(staticPlugin({ assets: diskUploadsRoot(), prefix: '/uploads', alwaysStatic: false }))
      .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/' }))
      .get(
        '/*',
        ({ path, set }) => {
          if (
            path.startsWith('/api') ||
            path.startsWith('/auth') ||
            path.startsWith('/openapi') ||
            path.startsWith('/uploads')
          ) {
            set.status = 404
            return { error: 'Not found' }
          }
          set.headers['content-type'] = 'text/html; charset=utf-8'
          return Bun.file(resolve('../frontend/dist/index.html'))
        },
        { detail: { hide: true } },
      )
  }

  return base
    .onRequest(({ request, set }) => {
      const p = new URL(request.url).pathname
      if (p.startsWith('/api/init/')) return
      if (p === '/api/i18n' || p.startsWith('/api/i18n/')) return
      if (p.startsWith('/api/') || p.startsWith('/auth/') || p.startsWith('/uploads/') || p.startsWith('/openapi')) {
        set.status = 503
        return { error: 'Setup required', code: 'setup_required' }
      }
    })
    .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/' }))
    .get(
      '/*',
      ({ set }) => {
        set.headers['content-type'] = 'text/html; charset=utf-8'
        return Bun.file(resolve('../frontend/dist/index.html'))
      },
      { detail: { hide: true } },
    )
}

export type App = Awaited<ReturnType<typeof createApp>>

if (!config.installed) {
  await bootSetupMode()
} else {
  await bootNormalMode()
}

async function bootSetupMode() {
  const { initBootstrap } = await import('$lib/bootstrap')
  const { setServerMode } = await import('$lib/server-mode')
  const { initCache } = await import('$lib/cache')
  setServerMode('setup')
  await initBootstrap()
  initCache()
  const app = (await createApp()).listen(port)
  logger.info({ module: 'boot', mode: 'setup', port: app.server?.port }, 'setup-mode ready')
}

async function bootNormalMode() {
  if (!config.database?.url) throw new Error('config.installed=true but database.url missing')

  const { connectDB, getDialect, db } = await import('$db')
  await connectDB(config.database.url)

  const dialect = getDialect()
  const migrationsFolder = resolve(`./src/db/migrations${dialect === 'sqlite' ? '' : '.' + dialect}`)
  if (dialect === 'pg') {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder })
  } else if (dialect === 'mysql') {
    const { migrate } = await import('drizzle-orm/mysql2/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder })
  } else {
    const { migrate } = await import('drizzle-orm/bun-sqlite/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    migrate(db as any, { migrationsFolder: resolve('./src/db/migrations') })
  }

  const { initSettings } = await import('$lib/settings')
  const { initProviderInstances, listEnabledInstances } = await import('$lib/provider-instance')
  const { initCache } = await import('$lib/cache')
  const { initStorage, diskUploadsRoot } = await import('$lib/storage')

  await initSettings()
  initCache()
  initStorage()
  await mkdir(diskUploadsRoot(), { recursive: true })
  await initProviderInstances()

  // Seed/upgrade the registry signing keypair on every boot. Fresh installs
  // also seed at the end of `/api/init/complete`; this boot-time call covers
  // upgrades from instances created before Phase 2 shipped Ed25519 signing.
  const { ensureSigningKey } = await import('$lib/registry-key')
  await ensureSigningKey()

  // Gate: only kick off the backfill when release_assets is behind releases.
  // The admin "Run backfill" button (Task 14) calls backfillReleaseAssets()
  // directly without this gate, so the gate is intentionally here at the
  // boot site rather than inside the function.
  queueMicrotask(async () => {
    try {
      const { count } = await import('drizzle-orm')
      const { releases, releaseAssets } = await import('$db/schema')
      const [releaseCount] = await db.select({ n: count() }).from(releases)
      const [assetCount] = await db.select({ n: count() }).from(releaseAssets)
      if ((assetCount?.n ?? 0) < (releaseCount?.n ?? 0)) {
        const { backfillReleaseAssets } = await import('$lib/release-assets-backfill')
        await backfillReleaseAssets()
      }
    } catch (err) {
      logger.warn({ module: 'boot', err }, 'release_assets backfill failed')
    }
  })

  const { setServerMode } = await import('$lib/server-mode')
  setServerMode('normal')

  if (listEnabledInstances().length === 0) {
    logger.warn('No provider instances configured — admin should add at least one via /admin')
  }

  logger.info({ module: 'boot', origins: corsOrigins }, 'CORS allowed origins')

  const app = (await createApp()).listen(port)
  const runningPort = app.server?.port
  logger.info(
    { module: 'boot', mode: 'normal', port: runningPort },
    `registry running on http://localhost:${runningPort}`,
  )
  logger.info({ module: 'boot' }, `OpenAPI spec: http://localhost:${runningPort}/openapi/json`)
  logger.info({ module: 'boot' }, `OpenAPI UI:   http://localhost:${runningPort}/openapi`)
}
