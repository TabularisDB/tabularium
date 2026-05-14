import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { resolve } from 'node:path'
import { connectDB, getDialect, db } from '$db'
import { users, rootCredentials } from '$db/schema'
import { saveConfig } from '$lib/config-file'
import { getBootstrap, clearBootstrap } from '$lib/bootstrap'
import { seedDefaultPages } from '$lib/seed-pages'
import { bootstrapAuthMiddleware } from '$middleware/bootstrap-auth'
import { signJwt } from '$lib/jwt'
import { isProd } from '$lib/env'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'init-complete' })

export default new Elysia()
  .use(bootstrapAuthMiddleware)
  .post(
    '/',
    async ({ body, set, cookie }) => {
      const boot = getBootstrap()
      if (!boot) {
        set.status = 410
        return { error: 'bootstrap_inactive' }
      }

      try {
        await connectDB(body.database.url)
      } catch (e) {
        log.error({ err: String(e) }, 'failed to connect to provided database')
        set.status = 400
        return { error: 'database_connect_failed', detail: String(e) }
      }

      const dialect = getDialect()
      const migrationsFolder = resolve(
        dialect === 'sqlite' ? './src/db/migrations' : `./src/db/migrations.${dialect}`,
      )
      try {
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
          migrate(db as any, { migrationsFolder })
        }
      } catch (e) {
        log.error({ err: String(e) }, 'migration failed')
        set.status = 500
        return { error: 'migration_failed', detail: String(e) }
      }

      const userId = ulid()
      try {
        await db.insert(users).values({ id: userId, displayName: 'Admin', role: 'admin' })
        await db.insert(rootCredentials).values({
          userId,
          email: boot.email.toLowerCase(),
          passwordHash: boot.passwordHash,
        })
      } catch (e) {
        log.error({ err: String(e) }, 'admin user creation failed')
        set.status = 500
        return { error: 'admin_create_failed', detail: String(e) }
      }

      try {
        await seedDefaultPages()
      } catch (e) {
        log.warn({ err: String(e) }, 'page seed failed — continuing')
      }

      await saveConfig({ installed: true, database: { url: body.database.url } })
      clearBootstrap()

      const jwt = await signJwt({
        sub: userId,
        identityId: null,
        username: 'Admin',
        providerInstanceId: null,
      })
      cookie.auth.set({
        value: jwt,
        httpOnly: true,
        secure: isProd(),
        maxAge: 3600,
        sameSite: 'lax',
        path: '/',
      })

      log.info({ adminId: userId, email: boot.email }, 'install complete — exiting for restart')
      setTimeout(() => process.exit(0), 500)
      return { ok: true }
    },
    {
      detail: { tags: ['Auth'], summary: 'Finalize install: connect DB, migrate, promote bootstrap admin, exit', operationId: 'initComplete' },
      body: t.Object({
        database: t.Object({ url: t.String({ minLength: 1 }) }),
      }),
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.Object({ error: t.String(), detail: t.Optional(t.String()) }),
        410: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String(), detail: t.Optional(t.String()) }),
      },
    },
  )
