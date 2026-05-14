/**
 * Detect which dialect a DATABASE_URL points to.
 * - `postgres://…` / `postgresql://…` → pg
 * - `mysql://…` → mysql
 * - `sqlite:./file` or any plain filesystem path → sqlite
 */
export type Dialect = 'sqlite' | 'pg' | 'mysql'

export function detectDialect(databaseUrl: string): Dialect {
  if (/^postgres(ql)?:\/\//i.test(databaseUrl)) return 'pg'
  if (/^mysql:\/\//i.test(databaseUrl)) return 'mysql'
  return 'sqlite'
}

export function sqlitePath(databaseUrl: string): string {
  return databaseUrl.replace(/^sqlite:(\/\/)?/, '')
}
