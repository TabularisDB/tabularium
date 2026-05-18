import { mkdir, unlink } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { logger } from './logger'
import { getSetting, isSettingsInitialized } from './settings'
import { env } from './env'

const log = logger.child({ module: 'storage' })

export type StorageDriver = 'off' | 'disk' | 's3'

const VALID: readonly StorageDriver[] = ['off', 'disk', 's3']

export type PutResult = {
  /** Public URL — pathname for `disk`, absolute URL for `s3`. */
  url: string
}

export interface StorageStore {
  driver: StorageDriver
  put(key: string, body: Uint8Array | ArrayBuffer, contentType: string): Promise<PutResult>
  del(key: string): Promise<void>
}

class NullStorage implements StorageStore {
  driver: StorageDriver = 'off'
  async put(): Promise<PutResult> {
    throw new Error('storage driver=off — set infra.storage.driver in /admin/infra')
  }
  async del(): Promise<void> {}
}

class DiskStorage implements StorageStore {
  driver: StorageDriver = 'disk'
  constructor(
    private root: string,
    private publicPrefix: string,
  ) {}

  private fsPath(key: string): string {
    return resolve(this.root, key)
  }

  async put(key: string, body: Uint8Array | ArrayBuffer, _contentType: string): Promise<PutResult> {
    const path = this.fsPath(key)
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, body)
    return { url: `${this.publicPrefix}/${key}` }
  }

  async del(key: string): Promise<void> {
    try {
      await unlink(this.fsPath(key))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
}

class S3Storage implements StorageStore {
  driver: StorageDriver = 's3'
  constructor(
    private client: import('bun').S3Client,
    private publicBaseUrl: string,
  ) {}

  async put(key: string, body: Uint8Array | ArrayBuffer, contentType: string): Promise<PutResult> {
    const file = this.client.file(key)
    await file.write(body, { type: contentType })
    return { url: `${this.publicBaseUrl}/${key}` }
  }

  async del(key: string): Promise<void> {
    await this.client.delete(key)
  }
}

let instance: StorageStore | null = null

type Config = {
  driver: StorageDriver
  diskRoot: string
  publicPrefix: string
  s3Bucket?: string
  s3Region?: string
  s3Endpoint?: string
  s3PublicBaseUrl?: string
  s3AccessKey?: string
  s3SecretKey?: string
}

function readConfig(): Config {
  const settings = isSettingsInitialized()
  const get = (key: string) => (settings ? getSetting(key) : undefined)

  const settingDriver = get('infra.storage.driver') as StorageDriver | undefined
  const driver: StorageDriver = settingDriver && VALID.includes(settingDriver) ? settingDriver : 'disk'

  return {
    driver,
    diskRoot: resolve(env.DATA_DIR, 'uploads'),
    publicPrefix: '/uploads',
    s3Bucket: get('infra.storage.s3_bucket'),
    s3Region: get('infra.storage.s3_region') ?? 'us-east-1',
    s3Endpoint: get('infra.storage.s3_endpoint'),
    s3PublicBaseUrl: get('infra.storage.s3_public_base_url'),
    s3AccessKey: get('infra.storage.s3_access_key'),
    s3SecretKey: get('infra.storage.s3_secret_key'),
  }
}

function build(cfg: Config): StorageStore {
  if (cfg.driver === 'off') return new NullStorage()
  if (cfg.driver === 'disk') return new DiskStorage(cfg.diskRoot, cfg.publicPrefix)
  if (!cfg.s3Bucket || !cfg.s3AccessKey || !cfg.s3SecretKey) {
    throw new Error('storage driver=s3 requires bucket, accessKey, secretKey settings')
  }
  const client = new Bun.S3Client({
    bucket: cfg.s3Bucket,
    region: cfg.s3Region,
    endpoint: cfg.s3Endpoint,
    accessKeyId: cfg.s3AccessKey,
    secretAccessKey: cfg.s3SecretKey,
  })
  const base = cfg.s3PublicBaseUrl ?? `${env.BASE_URL}/s3`
  return new S3Storage(client, base.replace(/\/$/, ''))
}

export function initStorage(): StorageStore {
  instance = build(readConfig())
  log.info({ driver: instance.driver }, 'storage initialized')
  return instance
}

export async function reconfigureStorage(): Promise<StorageStore> {
  instance = build(readConfig())
  log.info({ driver: instance.driver }, 'storage reconfigured')
  return instance
}

export function storage(): StorageStore {
  if (!instance) throw new Error('storage not initialized — call initStorage() at boot')
  return instance
}

export function resetStorageForTests(): void {
  instance = null
}

export function diskUploadsRoot(): string {
  return readConfig().diskRoot
}
