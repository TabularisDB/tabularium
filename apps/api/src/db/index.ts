import { detectDialect, sqlitePath, type Dialect } from './dialect'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _instance: any = null
let _dialect: Dialect | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _native: any = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Proxy({} as any, {
  get(_t, prop, recv) {
    if (!_instance) throw new Error('DB accessed before connectDB() — install gate leak?')
    return Reflect.get(_instance, prop, recv)
  },
})

export type DB = typeof db

export function getDialect(): Dialect {
  if (!_dialect) throw new Error('DB not connected')
  return _dialect
}

export function isDBConnected(): boolean {
  return _instance !== null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sqliteNative(): any {
  return _native
}

export async function connectDB(databaseUrl: string): Promise<void> {
  if (_instance) return
  _dialect = detectDialect(databaseUrl)

  if (_dialect === 'pg') {
    const postgres = (await import('postgres')).default
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { relations } = await import('./relations.pg')
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
    _instance = drizzle({ client, relations })
    return
  }

  if (_dialect === 'mysql') {
    const mysql = await import('mysql2/promise')
    const { drizzle } = await import('drizzle-orm/mysql2')
    const { relations } = await import('./relations.mysql')
    const pool = mysql.createPool({ uri: databaseUrl, supportBigNumbers: true, bigNumberStrings: false })
    _instance = drizzle({ client: pool, relations, mode: 'default' as const })
    return
  }

  const { Database } = await import('bun:sqlite')
  const { drizzle } = await import('drizzle-orm/bun-sqlite')
  const { relations } = await import('./relations')
  const sqlite = new Database(sqlitePath(databaseUrl))
  _native = sqlite
  _instance = drizzle({ client: sqlite, relations })
}
