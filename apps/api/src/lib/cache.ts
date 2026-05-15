import { logger } from './logger'
import { getSetting, isSettingsInitialized } from './settings'
import { env } from './env'

const log = logger.child({ module: 'cache' })

export type CacheDriver = 'off' | 'memory' | 'redis'

const VALID: readonly CacheDriver[] = ['off', 'memory', 'redis']

export type CacheValidator<T> = (v: unknown) => v is T

export interface CacheStore {
  driver: CacheDriver
  get<T>(key: string, validate?: CacheValidator<T>): Promise<T | null>
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  incr(key: string, ttlSeconds?: number): Promise<number>
  dispose?(): Promise<void>
}

export const isString = (v: unknown): v is string => typeof v === 'string'

class NullCache implements CacheStore {
  driver: CacheDriver = 'off'
  async get<T>(_key: string, _validate?: CacheValidator<T>): Promise<T | null> { return null }
  async set(): Promise<void> { }
  async del(): Promise<void> { }
  async incr(): Promise<number> {
    throw new Error('cache driver=off does not support incr — rate-limit needs memory or redis')
  }
}

type MemoryEntry = { value: unknown; expiresAt: number | null }

class MemoryCache implements CacheStore {
  driver: CacheDriver = 'memory'
  private store = new Map<string, MemoryEntry>()

  private alive(entry: MemoryEntry | undefined): entry is MemoryEntry {
    if (!entry) return false
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) return false
    return true
  }

  async get<T>(key: string, validate?: CacheValidator<T>): Promise<T | null> {
    const entry = this.store.get(key)
    if (!this.alive(entry)) {
      if (entry) this.store.delete(key)
      return null
    }
    if (validate && !validate(entry.value)) {
      log.warn({ key }, 'cache value failed validation — discarding')
      this.store.delete(key)
      return null
    }
    return entry.value as T
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    this.store.set(key, { value, expiresAt })
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const entry = this.store.get(key)
    if (this.alive(entry)) {
      const next = (entry.value as number) + 1
      entry.value = next
      return next
    }
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    this.store.set(key, { value: 1, expiresAt })
    return 1
  }

  async dispose(): Promise<void> {
    this.store.clear()
  }
}

class RedisCache implements CacheStore {
  driver: CacheDriver = 'redis'
  constructor(private client: import('bun').RedisClient) { }

  async get<T>(key: string, validate?: CacheValidator<T>): Promise<T | null> {
    const raw = await this.client.get(key)
    if (raw === null || raw === undefined) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = raw
    }
    if (validate && !validate(parsed)) {
      log.warn({ key }, 'cache value failed validation — discarding')
      await this.client.del(key)
      return null
    }
    return parsed as T
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    if (ttlSeconds) {
      await this.client.set(key, serialized, 'EX', ttlSeconds)
      return
    }
    await this.client.set(key, serialized)
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const next = await this.client.incr(key)
    if (next === 1 && ttlSeconds) await this.client.expire(key, ttlSeconds)
    return next
  }

  async dispose(): Promise<void> {
    this.client.close()
  }
}

function build(driver: CacheDriver, redisUrl?: string): CacheStore {
  if (driver === 'off') return new NullCache()
  if (driver === 'memory') return new MemoryCache()
  if (!redisUrl) throw new Error('CACHE_DRIVER=redis requires REDIS_URL or infra.cache.redis_url setting')
  return new RedisCache(new Bun.RedisClient(redisUrl))
}

let instance: CacheStore | null = null

function readConfig(): { driver: CacheDriver; redisUrl?: string } {
  if (!isSettingsInitialized()) {
    return { driver: env.CACHE_DRIVER, redisUrl: env.REDIS_URL }
  }
  const fromSettings = getSetting('infra.cache.driver') as CacheDriver | undefined
  const driver: CacheDriver = fromSettings && VALID.includes(fromSettings) ? fromSettings : env.CACHE_DRIVER
  const redisUrl = getSetting('infra.cache.redis_url') ?? env.REDIS_URL
  return { driver, redisUrl }
}

export function initCache(): CacheStore {
  const { driver, redisUrl } = readConfig()
  instance = build(driver, redisUrl)
  log.info({ driver }, 'cache initialized')
  return instance
}

export async function reconfigureCache(): Promise<CacheStore> {
  if (instance?.dispose) await instance.dispose()
  const { driver, redisUrl } = readConfig()
  instance = build(driver, redisUrl)
  log.info({ driver }, 'cache reconfigured')
  return instance
}

export function cache(): CacheStore {
  if (!instance) throw new Error('cache not initialized — call initCache() at boot')
  return instance
}

export function resetCacheForTests(): void {
  instance = null
}
