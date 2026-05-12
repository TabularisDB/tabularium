// src/db/seed.ts
import { db } from './index'
import { users, plugins, releases } from './schema'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

migrate(db, { migrationsFolder: './src/db/migrations' })

const REGISTRY_OWNER_ID = 'seed-system-user'

await db.insert(users).values({
  id: REGISTRY_OWNER_ID,
  provider: 'github' as const,
  externalId: '0',
  username: 'tabularis-registry',
}).onConflictDoNothing()

type RegistryJson = {
  schema_version: number
  plugins: Array<{
    id: string
    name: string
    description: string
    author: string
    homepage: string
    latest_version: string
    releases: Array<{
      version: string
      min_tabularis_version: string
      assets: Record<string, string>
    }>
  }>
}

const registryPath = '/home/newt/Projekte/Personal/NewtTheWolf/tabularis/plugins/registry.json'
const registry = await Bun.file(registryPath).json() as RegistryJson

let pluginCount = 0
let releaseCount = 0

for (const plugin of registry.plugins) {
  await db.insert(plugins).values({
    id: plugin.id,
    ownerId: REGISTRY_OWNER_ID,
    name: plugin.name,
    description: plugin.description,
    author: plugin.author,
    repoUrl: plugin.homepage,
    homepage: plugin.homepage,
    latestVersion: plugin.latest_version,
    webhookSecret: crypto.randomUUID(),
  }).onConflictDoNothing()
  pluginCount++

  for (const release of plugin.releases) {
    await db.insert(releases).values({
      id: crypto.randomUUID(),
      pluginId: plugin.id,
      version: release.version,
      minTabularisVersion: release.min_tabularis_version,
      assets: JSON.stringify(release.assets),
    }).onConflictDoNothing()
    releaseCount++
  }
}

console.log(`Seeded ${pluginCount} plugins and ${releaseCount} releases.`)
