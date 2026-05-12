// tests/helpers.ts
import { Elysia } from 'elysia'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'
import { db } from '../src/db'
import * as schema from '../src/db/schema'

export async function clearDb() {
  await db.delete(schema.pluginRequestVotes)
  await db.delete(schema.pluginRequests)
  await db.delete(schema.challenges)
  await db.delete(schema.releases)
  await db.delete(schema.plugins)
  await db.delete(schema.users)
}

export async function makeUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const user = {
    id: crypto.randomUUID(),
    provider: 'github' as const,
    providerInstanceUrl: null,
    externalId: String(Math.floor(Math.random() * 100000)),
    username: 'testuser',
    accessToken: 'test-access-token',
    ...overrides,
  }
  await db.insert(schema.users).values(user)
  return user
}

export async function makePlugin(
  ownerId: string,
  overrides: Partial<typeof schema.plugins.$inferInsert> = {}
) {
  const plugin = {
    id: 'test-plugin',
    ownerId,
    name: 'Test Plugin',
    description: 'A test plugin',
    author: 'testuser <https://github.com/testuser>',
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
