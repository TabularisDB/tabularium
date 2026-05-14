import { eq } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../db/schema'
import { encryptToken, decryptToken } from './crypto'

const MASK = '••••••••'

const cache = new Map<string, { value: string; encrypted: boolean }>()
let initialized = false

export async function initSettings(): Promise<void> {
  const rows = await db.select().from(settings)
  cache.clear()
  for (const row of rows) {
    const value = row.encrypted ? decryptToken(row.value) : row.value
    cache.set(row.key, { value, encrypted: row.encrypted === 1 })
  }
  initialized = true
}

function assertInit() {
  if (!initialized) throw new Error('settings cache not initialized — call initSettings() at boot')
}

export function isSettingsInitialized(): boolean {
  return initialized
}

export function getSetting(key: string): string | undefined {
  assertInit()
  return cache.get(key)?.value
}

export function hasSetting(key: string): boolean {
  assertInit()
  return cache.has(key)
}

export type SettingEntry = {
  key: string
  value: string | null
  encrypted: boolean
  updatedAt: number
}

export async function listSettings(): Promise<SettingEntry[]> {
  assertInit()
  const rows = await db.select().from(settings)
  return rows.map((r) => ({
    key: r.key,
    value: r.encrypted === 1 ? (r.value ? MASK : null) : r.value,
    encrypted: r.encrypted === 1,
    updatedAt: r.updatedAt,
  }))
}

export async function setSetting(
  key: string,
  value: string,
  opts: { encrypted?: boolean } = {},
): Promise<void> {
  assertInit()
  const encrypted = opts.encrypted ?? false
  const stored = encrypted ? encryptToken(value) : value
  const now = Date.now()
  await db
    .insert(settings)
    .values({ key, value: stored, encrypted: encrypted ? 1 : 0, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: stored, encrypted: encrypted ? 1 : 0, updatedAt: now },
    })
  cache.set(key, { value, encrypted })
}

export async function deleteSetting(key: string): Promise<void> {
  assertInit()
  await db.delete(settings).where(eq(settings.key, key))
  cache.delete(key)
}
