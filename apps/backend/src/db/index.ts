// src/db/index.ts
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

const sqlite = new Database(Bun.env.DATABASE_URL ?? './data/registry.db')
export const db = drizzle(sqlite, { schema })
export type DB = typeof db
