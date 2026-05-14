// src/db/index.ts
import { env } from '../lib/env'
import { detectDialect, sqlitePath, type Dialect } from './dialect'

export const dialect: Dialect = detectDialect(env.DATABASE_URL)

async function build() {
  if (dialect === 'pg') {
    const postgres = (await import('postgres')).default
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { relations } = await import('./relations.pg')
    const client = postgres(env.DATABASE_URL, { types: { bigint: postgres.BigInt } })
    return { instance: drizzle({ client, relations }) }
  }
  if (dialect === 'mysql') {
    const mysql = await import('mysql2/promise')
    const { drizzle } = await import('drizzle-orm/mysql2')
    const { relations } = await import('./relations.mysql')
    const pool = mysql.createPool({ uri: env.DATABASE_URL, supportBigNumbers: true, bigNumberStrings: false })
    return { instance: drizzle({ client: pool, relations, mode: 'default' as const }) }
  }
  const { Database } = await import('bun:sqlite')
  const { drizzle } = await import('drizzle-orm/bun-sqlite')
  const { relations } = await import('./relations')
  const sqlite = new Database(sqlitePath(env.DATABASE_URL))
  return { instance: drizzle({ client: sqlite, relations }), native: sqlite }
}

const built = await build()

// Drizzle v1 db handle. Same query API across all dialects:
//   db.query.<table>.findFirst / findMany({ where: {...}, with: {...}, orderBy: {...} })
//   db.select() / db.insert() / db.update() / db.delete() builder API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = built.instance as any
export type DB = typeof db

export const sqliteNative = 'native' in built ? built.native : null
