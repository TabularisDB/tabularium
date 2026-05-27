import { ulid } from 'ulid'
import { db, connectDB, getDialect } from '$db'
import { users, identities, plugins, releases } from '$db/schema'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

const registryPath = process.env.SEED_REGISTRY_JSON ?? './seed-registry.json'
const url = process.env.DATABASE_URL ?? './data/registry.db'

await connectDB(url)

if (getDialect() === 'sqlite') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  migrate(db as any, { migrationsFolder: './src/db/migrations' })
}

const REGISTRY_OWNER_ID = 'seed-system-user'
const REGISTRY_OWNER_IDENTITY_ID = 'seed-system-identity'

await db
  .insert(users)
  .values({
    id: REGISTRY_OWNER_ID,
    displayName: 'tabularium',
  })
  .onConflictDoNothing()

await db
  .insert(identities)
  .values({
    id: REGISTRY_OWNER_IDENTITY_ID,
    userId: REGISTRY_OWNER_ID,
    providerInstanceId: 'seed-system-provider',
    externalId: '0',
    username: 'tabularium',
  })
  .onConflictDoNothing()

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
      min_runtime_version: string
      assets: Record<string, string>
    }>
  }>
}

const file = Bun.file(registryPath)
if (!(await file.exists())) {
  console.error(`seed-registry.json not found at ${registryPath} — set SEED_REGISTRY_JSON to override`)
  process.exit(1)
}
const registry = (await file.json()) as RegistryJson

let pluginCount = 0
let releaseCount = 0

for (const plugin of registry.plugins) {
  await db
    .insert(plugins)
    .values({
      id: plugin.id,
      ownerId: REGISTRY_OWNER_ID,
      name: plugin.name,
      description: plugin.description,
      author: plugin.author,
      repoUrl: plugin.homepage,
      homepage: plugin.homepage,
      latestVersion: plugin.latest_version,
      webhookSecret: ulid(),
    })
    .onConflictDoNothing()
  pluginCount++

  for (const release of plugin.releases) {
    await db
      .insert(releases)
      .values({
        id: ulid(),
        pluginId: plugin.id,
        version: release.version,
        minRuntimeVersion: release.min_runtime_version,
        assets: JSON.stringify(release.assets),
      })
      .onConflictDoNothing()
    releaseCount++
  }
}

console.log(`Seeded ${pluginCount} plugins and ${releaseCount} releases.`)
