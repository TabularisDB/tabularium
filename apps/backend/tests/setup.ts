// tests/setup.ts
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

// Set env before any module that reads it loads
process.env.DATABASE_URL = ':memory:'
process.env.JWT_SECRET = 'test-secret-32-bytes-long-minimum'
process.env.BASE_URL = 'http://localhost:3000'
process.env.GITHUB_CLIENT_ID = 'test-github-client-id'
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret'
process.env.GITEA_CODEBERG_CLIENT_ID = 'test-gitea-client-id'
process.env.GITEA_CODEBERG_CLIENT_SECRET = 'test-gitea-secret'

// Run migrations on the in-memory DB
const { db } = await import('../src/db')
migrate(db, { migrationsFolder: './src/db/migrations' })
