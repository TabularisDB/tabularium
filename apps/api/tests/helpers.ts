// tests/helpers.ts
import { Elysia } from 'elysia'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'
import { ulid } from 'ulid'
import { db } from '../src/db'
import * as schema from '../src/db/schema'
import { encryptToken } from '../src/lib/crypto'
import { initProviderInstances } from '../src/lib/provider-instance'
import { initSettings } from '../src/lib/settings'
import { initCache } from '../src/lib/cache'
import { initStorage } from '../src/lib/storage'

const DEFAULT_INSTANCE_ID = 'github'

async function ensureDefaultInstance() {
  const existing = await db.query.providerInstances.findFirst({
    where: { id: DEFAULT_INSTANCE_ID },
  })
  if (existing) return
  await db.insert(schema.providerInstances).values({
    id: DEFAULT_INSTANCE_ID,
    kind: 'github',
    displayName: 'GitHub',
    baseUrl: 'https://github.com',
    clientId: 'test-client-id',
    clientSecret: encryptToken('test-client-secret'),
    enabled: 1,
  })
}

export async function clearDb() {
  await db.delete(schema.pluginRequestClaims)
  await db.delete(schema.pluginRequestVotes)
  await db.delete(schema.pluginRequests)
  await db.delete(schema.releaseAssets)
  await db.delete(schema.releases)
  await db.delete(schema.plugins)
  await db.delete(schema.identities)
  await db.delete(schema.rootCredentials)
  await db.delete(schema.users)
  await db.delete(schema.providerInstances)
  await db.delete(schema.settings)
  await ensureDefaultInstance()
  await initProviderInstances()
  await initSettings()
  initCache()
  initStorage()
}

export type TestUser = {
  id: string
  username: string
  providerInstanceId: string
  externalId: string
  accessToken: string
  identityId: string
  role: 'user' | 'admin'
}

export async function makeUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  await ensureDefaultInstance()
  const id = overrides.id ?? ulid()
  const identityId = overrides.identityId ?? ulid()
  const username = overrides.username ?? 'testuser'

  const user: TestUser = {
    id,
    identityId,
    username,
    providerInstanceId: DEFAULT_INSTANCE_ID,
    externalId: String(Math.floor(Math.random() * 100000)),
    accessToken: 'test-access-token',
    role: 'user',
    ...overrides,
  }

  await db.insert(schema.users).values({
    id: user.id,
    displayName: user.username,
    role: user.role,
  })
  await db.insert(schema.identities).values({
    id: user.identityId,
    userId: user.id,
    providerInstanceId: user.providerInstanceId,
    externalId: user.externalId,
    username: user.username,
    accessToken: encryptToken(user.accessToken),
  })
  return user
}

export async function makePlugin(
  ownerId: string,
  overrides: Partial<typeof schema.plugins.$inferInsert> = {}
) {
  const plugin = {
    id: 'test-plugin',
    ownerId,
    providerInstanceId: DEFAULT_INSTANCE_ID,
    name: 'Test Plugin',
    description: 'A test plugin',
    author: 'testuser <https://github.com/testuser/test-plugin>',
    repoUrl: 'https://github.com/testuser/test-plugin',
    homepage: 'https://github.com/testuser/test-plugin',
    latestVersion: null,
    webhookSecret: 'test-webhook-secret',
    ...overrides,
  }
  await db.insert(schema.plugins).values(plugin)
  return plugin
}

let cachedApp: Elysia | null = null

export async function buildApp() {
  if (cachedApp) return cachedApp
  cachedApp = new Elysia({ systemRouter: false }).use(
    await fileRouter({
      dir: resolve(import.meta.dir, '../src/routes'),
      types: false,
      logLevel: 'silent',
    }),
  )
  return cachedApp
}
