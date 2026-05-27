import { db, connectDB, getDialect } from '$db'
import { migrate as migrateSqlite } from 'drizzle-orm/bun-sqlite/migrator'

const url = process.env.DATABASE_URL ?? './data/registry.db'
await connectDB(url)

const dialect = getDialect()
if (dialect !== 'sqlite') {
  console.error(
    `migrate.ts only handles sqlite — for ${dialect} use 'bunx drizzle-kit migrate --config drizzle.${dialect}.config.ts'`,
  )
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
migrateSqlite(db as any, { migrationsFolder: './src/db/migrations' })
console.log('Migrations applied.')
