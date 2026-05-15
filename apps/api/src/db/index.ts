import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite'
import { detectDialect, sqlitePath, type Dialect } from './dialect'
import * as schema from './schema'
import { relations } from './relations'

export type DB = SQLiteBunDatabase<typeof schema, typeof relations>

let _instance: DB | null = null
let _dialect: Dialect | null = null
let _native: import('bun:sqlite').Database | null = null

export const db: DB = new Proxy({} as DB, {
  get(_t, prop, recv) {
    if (!_instance) throw new Error('DB accessed before connectDB() — install gate leak?')
    return Reflect.get(_instance, prop, recv)
  },
}) as DB

export function getDialect(): Dialect {
  if (!_dialect) throw new Error('DB not connected')
  return _dialect
}

export function isDBConnected(): boolean {
  return _instance !== null
}

export function sqliteNative(): import('bun:sqlite').Database | null {
  return _native
}

export async function connectDB(databaseUrl: string): Promise<void> {
  if (_instance) return
  _dialect = detectDialect(databaseUrl)

  if (_dialect === 'pg') {
    const postgres = (await import('postgres')).default
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { relations: pgRelations } = await import('./relations.pg')
    const client = postgres(databaseUrl, {
      types: {
        bigint: {
          to: 20,
          from: [20],
          serialize: (x: bigint | number | string) => x.toString(),
          parse: (x: string) => Number(x),
        },
      },
    })
    _instance = drizzle({ client, relations: pgRelations }) as unknown as DB
    return
  }

  if (_dialect === 'mysql') {
    const mysql = await import('mysql2/promise')
    const { drizzle } = await import('drizzle-orm/mysql2')
    const { relations: mysqlRelations } = await import('./relations.mysql')
    const pool = mysql.createPool({ uri: databaseUrl, supportBigNumbers: true, bigNumberStrings: false })
    _instance = drizzle({ client: pool, relations: mysqlRelations, mode: 'default' as const }) as unknown as DB
    return
  }

  const { Database } = await import('bun:sqlite')
  const { drizzle } = await import('drizzle-orm/bun-sqlite')
  const sqlite = new Database(sqlitePath(databaseUrl))
  _native = sqlite
  _instance = drizzle({ client: sqlite, relations })
}
