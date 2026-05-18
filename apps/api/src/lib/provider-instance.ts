import { eq } from 'drizzle-orm'
import { db } from '$db'
import { providerInstances } from '$db/schema'
import { encryptToken, decryptToken } from '$lib/crypto'

export type ProviderKind = 'github' | 'gitlab' | 'gitea'

export type ProviderInstance = {
  id: string
  kind: ProviderKind
  displayName: string
  baseUrl: string
  clientId: string
  clientSecret: string
  logoUrl: string | null
  enabled: boolean
}

// In-memory cache. Re-built from DB at boot and on any write.
let cache = new Map<string, ProviderInstance>()
let initialized = false

function toInstance(row: typeof providerInstances.$inferSelect): ProviderInstance {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.displayName,
    baseUrl: row.baseUrl.replace(/\/$/, ''),
    clientId: row.clientId,
    clientSecret: decryptToken(row.clientSecret),
    logoUrl: row.logoUrl,
    enabled: row.enabled === 1,
  }
}

export async function initProviderInstances(): Promise<void> {
  const rows = await db.select().from(providerInstances)
  cache = new Map(rows.map((r) => [r.id, toInstance(r)]))
  initialized = true
}

function assertInit() {
  if (!initialized) throw new Error('provider-instance cache not initialized — call initProviderInstances() at boot')
}

export function listInstances(): ProviderInstance[] {
  assertInit()
  return [...cache.values()]
}

export function listEnabledInstances(): ProviderInstance[] {
  return listInstances().filter((i) => i.enabled)
}

export function getInstance(id: string): ProviderInstance | undefined {
  assertInit()
  return cache.get(id)
}

export function findInstanceByBaseUrl(url: string): ProviderInstance | undefined {
  assertInit()
  const origin = url.replace(/\/$/, '')
  for (const inst of cache.values()) {
    if (inst.baseUrl === origin) return inst
  }
  return undefined
}

export type CreateInstanceInput = {
  id: string
  kind: ProviderKind
  displayName: string
  baseUrl: string
  clientId: string
  clientSecret: string
  logoUrl?: string | null
  enabled?: boolean
}

export async function createInstance(input: CreateInstanceInput): Promise<ProviderInstance> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.id)) {
    throw new Error('Instance id must be a lowercase slug (a-z, 0-9, hyphen)')
  }
  let parsed: URL
  try {
    parsed = new URL(input.baseUrl)
  } catch {
    throw new Error('baseUrl must be a valid URL')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('baseUrl must use http(s)')
  }
  const baseUrl = parsed.origin
  await db.insert(providerInstances).values({
    id: input.id,
    kind: input.kind,
    displayName: input.displayName,
    baseUrl,
    clientId: input.clientId,
    clientSecret: encryptToken(input.clientSecret),
    logoUrl: input.logoUrl ?? null,
    enabled: (input.enabled ?? true) ? 1 : 0,
  })
  await initProviderInstances()
  return cache.get(input.id)!
}

export type UpdateInstanceInput = Partial<Omit<CreateInstanceInput, 'id'>>

export async function updateInstance(id: string, patch: UpdateInstanceInput): Promise<ProviderInstance | null> {
  const set: Record<string, unknown> = {}
  if (patch.kind !== undefined) set.kind = patch.kind
  if (patch.displayName !== undefined) set.displayName = patch.displayName
  if (patch.baseUrl !== undefined) {
    let parsed: URL
    try {
      parsed = new URL(patch.baseUrl)
    } catch {
      throw new Error('baseUrl must be a valid URL')
    }
    set.baseUrl = parsed.origin
  }
  if (patch.clientId !== undefined) set.clientId = patch.clientId
  if (patch.clientSecret !== undefined) set.clientSecret = encryptToken(patch.clientSecret)
  if (patch.logoUrl !== undefined) set.logoUrl = patch.logoUrl
  if (patch.enabled !== undefined) set.enabled = patch.enabled ? 1 : 0
  if (Object.keys(set).length === 0) return cache.get(id) ?? null

  await db.update(providerInstances).set(set).where(eq(providerInstances.id, id))
  await initProviderInstances()
  return cache.get(id) ?? null
}

export async function deleteInstance(id: string): Promise<void> {
  await db.delete(providerInstances).where(eq(providerInstances.id, id))
  await initProviderInstances()
}
