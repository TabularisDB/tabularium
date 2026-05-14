import { db } from './index'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

migrate(db, { migrationsFolder: './src/db/migrations' })
console.log('Migrations applied.')
