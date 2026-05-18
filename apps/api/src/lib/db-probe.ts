import { detectDialect, sqlitePath, type Dialect } from '../db/dialect'

export type ProbeResult = { ok: true; dialect: Dialect } | { ok: false; dialect: Dialect; error: string }

const TIMEOUT_MS = 5000

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`connection timed out after ${ms}ms`)), ms))
}

async function probePostgres(url: string): Promise<void> {
  const postgres = (await import('postgres')).default
  const client = postgres(url, { connect_timeout: 5, idle_timeout: 1, max: 1 })
  try {
    await Promise.race([client`SELECT 1`, timeoutAfter(TIMEOUT_MS)])
  } finally {
    await client.end({ timeout: 1 })
  }
}

async function probeMysql(url: string): Promise<void> {
  const mysql = await import('mysql2/promise')
  const conn = await Promise.race([
    mysql.createConnection({ uri: url, connectTimeout: TIMEOUT_MS }),
    timeoutAfter(TIMEOUT_MS),
  ])
  try {
    await Promise.race([conn.query('SELECT 1'), timeoutAfter(TIMEOUT_MS)])
  } finally {
    await conn.end()
  }
}

async function probeSqlite(url: string): Promise<void> {
  const { Database } = await import('bun:sqlite')
  const path = sqlitePath(url)
  const db = new Database(path)
  try {
    db.query('SELECT 1').get()
  } finally {
    db.close()
  }
}

export async function probeDatabase(url: string): Promise<ProbeResult> {
  const dialect = detectDialect(url)
  try {
    if (dialect === 'pg') await probePostgres(url)
    else if (dialect === 'mysql') await probeMysql(url)
    else await probeSqlite(url)
    return { ok: true, dialect }
  } catch (err) {
    return { ok: false, dialect, error: err instanceof Error ? err.message : String(err) }
  }
}
