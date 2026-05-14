import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.mysql.ts',
  out: './src/db/migrations.mysql',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/tabularium',
  },
})
