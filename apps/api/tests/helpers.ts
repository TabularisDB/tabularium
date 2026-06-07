// tests/helpers.ts
import { Elysia } from 'elysia'
import { fsr, LogLevel } from 'elysia-fsr'
import { resolve } from 'node:path'
import { ulid } from 'ulid'
import { db } from '../src/db'
import * as schema from '../src/db/schema'
import { encryptToken } from '../src/lib/crypto'
import { signJwt } from '../src/lib/jwt'
import { initProviderInstances } from '../src/lib/provider-instance'
import { initSettings } from '../src/lib/settings'
import { initCache } from '../src/lib/cache'
import { initStorage } from '../src/lib/storage'
import {
  initPlugins,
  __clearLoadedForTests,
  __clearContributions,
  __clearRoutes,
  listRoutes,
  registry,
  bus,
} from '../src/lib/plugin-host'

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
  await db.delete(schema.auditLog)
  await db.delete(schema.emailLog)
  await db.delete(schema.emailPreferences)
  await db.delete(schema.emailSuppression)
  await db.delete(schema.rootCredentials)
  await db.delete(schema.users)
  await db.delete(schema.providerInstances)
  await db.delete(schema.settings)
  await ensureDefaultInstance()
  await initProviderInstances()
  await initSettings()
  initCache()
  initStorage()
  // Reset plugin host state so initPlugins() runs cleanly each test.
  __clearLoadedForTests()
  __clearContributions()
  __clearRoutes()
  registry.__clear()
  bus.__clear()
  await initPlugins()
  // Invalidate the cached test Elysia app so the next buildApp() picks up
  // freshly-mounted plugin routes from listRoutes().
  cachedApp = null
}

export type TestUser = {
  id: string
  username: string
  providerInstanceId: string
  externalId: string
  accessToken: string
  identityId: string
  role: 'user' | 'admin'
  email?: string | null
  locale?: string
  // Pre-signed JWT for tests that need synchronous header construction
  // (see adminHeaders). Populated by makeUser/makeAdmin.
  jwt: string
}

export async function makeUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  await ensureDefaultInstance()
  const id = overrides.id ?? ulid()
  const identityId = overrides.identityId ?? ulid()
  const username = overrides.username ?? 'testuser'

  const base = {
    id,
    identityId,
    username,
    providerInstanceId: DEFAULT_INSTANCE_ID,
    externalId: String(Math.floor(Math.random() * 100000)),
    accessToken: 'test-access-token',
    role: 'user' as const,
    email: overrides.email,
    locale: overrides.locale,
    ...overrides,
  }

  await db.insert(schema.users).values({
    id: base.id,
    displayName: base.username,
    role: base.role,
    ...(base.email !== undefined ? { email: base.email } : {}),
    ...(base.locale !== undefined ? { locale: base.locale } : {}),
  })
  await db.insert(schema.identities).values({
    id: base.identityId,
    userId: base.id,
    providerInstanceId: base.providerInstanceId,
    externalId: base.externalId,
    username: base.username,
    accessToken: encryptToken(base.accessToken),
  })
  const jwt = await signJwt({
    sub: base.id,
    identityId: base.identityId,
    username: base.username,
    providerInstanceId: base.providerInstanceId,
  })
  return { ...base, jwt }
}

// Create an admin test user. Mirrors makeUser but defaults role to 'admin'.
// Shared across admin route tests (Tasks 9-12).
export async function makeAdmin(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  return makeUser({ username: 'admin', ...overrides, role: 'admin' })
}

// Synchronous Authorization headers for an admin test user. The admin
// middleware accepts JWT bearer tokens; the JWT is pre-signed during
// makeUser/makeAdmin and stored on TestUser.jwt so this can stay sync.
export function adminHeaders(admin: TestUser): { Authorization: string } {
  return { Authorization: `Bearer ${admin.jwt}` }
}

// Mirror of adminHeaders for non-admin test users.
export function userHeaders(user: TestUser): { Authorization: string } {
  return { Authorization: `Bearer ${user.jwt}` }
}

export async function makePlugin(ownerId: string, overrides: Partial<typeof schema.plugins.$inferInsert> = {}) {
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
  let app = new Elysia({ systemRouter: false }).use(
    await fsr({
      dir: resolve(import.meta.dir, '../src/routes'),
      types: false,
      logLevel: LogLevel.Silent,
    }),
  )
  // Mount routes contributed by plugins via host.mountRoutes(). Cast to
  // Elysia — recordRoutes types it as `unknown` so the public PluginHost
  // type can stay Elysia-free.
  for (const sub of listRoutes()) app = app.use(sub as Elysia)
  cachedApp = app
  return cachedApp
}
