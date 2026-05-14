import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.pg.ts',
  out: './src/db/migrations.pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/tabularium',
  },
})
