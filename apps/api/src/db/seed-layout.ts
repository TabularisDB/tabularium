import { resolve } from 'node:path'
import { db, connectDB } from '$db'
import { detectDialect, sqlitePath } from './dialect'
import { users, plugins, releases } from '$db/schema'

// Catalog fixtures only, deliberately restricted to the local development database.
const url = process.env.DATABASE_URL ?? './data/registry.db'
const path = resolve(sqlitePath(url))
if (
  process.env.NODE_ENV === 'production' ||
  detectDialect(url) !== 'sqlite' ||
  !path.startsWith(`${resolve('data')}/`)
) {
  throw new Error('Layout fixtures require a development SQLite database inside apps/api/data.')
}
if (!(await Bun.file(path).exists())) {
  throw new Error('Initialize the local registry before running seed:layout.')
}

type Fixture = {
  slug: string
  name: string
  description: string
  author: string
  version: string | null
  category: string | null
  license: string | null
  downloads: number
  verified?: boolean
  color?: string
}

const fixtures: Fixture[] = [
  {
    slug: 'dynamodb',
    name: 'dynamodb',
    description: 'Tabularis driver plugin for AWS DynamoDB. Connect with an AWS region and browse your tables.',
    author: 'fuleinist',
    version: '0.1.7',
    category: null,
    license: null,
    downloads: 88,
    verified: true,
    color: '#8b5cf6',
  },
  {
    slug: 'postgresql',
    name: 'PostgreSQL',
    description:
      'Full-featured PostgreSQL driver for Tabularis: browse schemas, tables, views, functions and extensions.',
    author: 'aesslinger',
    version: '1.0.0-rc.7',
    category: 'database',
    license: 'Apache-2.0',
    downloads: 3400,
    verified: true,
    color: '#336791',
  },
  {
    slug: 'mongodb-atlas',
    name: 'mongodb-atlas',
    description: 'MongoDB NoSQL database driver with Atlas (mongodb+srv) support.',
    author: 'debba',
    version: '0.2.0',
    category: null,
    license: null,
    downloads: 481,
    verified: true,
    color: '#2d8659',
  },
  {
    slug: 'long-title',
    name: 'PostgreSQL Enterprise Analytics and Database Administration Toolkit',
    description: 'Short description.',
    author: 'Database Platform Engineering and Community Maintainers <https://example.invalid/layout-tests>',
    version: '12.34.56-beta.123+build.20261011',
    category: 'database-administration-and-analytics',
    license: 'AGPL-3.0-or-later WITH custom-exception',
    downloads: 1234567,
    verified: true,
  },
  {
    slug: 'minimal',
    name: 'Minimal',
    description: 'One line.',
    author: 'dev',
    version: '1.0.0',
    category: null,
    license: null,
    downloads: 0,
  },
  {
    slug: 'no-release',
    name: 'Upcoming Driver',
    description: 'A catalog entry with no published release yet.',
    author: 'Preview Team',
    version: null,
    category: 'database',
    license: 'MIT',
    downloads: 0,
    color: '#d97706',
  },
  {
    slug: 'unbroken-text',
    name: 'VeryLongPluginNameWithoutAnySpacesToExerciseTruncation',
    description:
      'VeryLongDescriptionWithoutAnySpacesToExerciseWrappingAndPreventTheCardFromOverflowingAtNarrowViewportWidths0123456789',
    author: 'VeryLongAuthorNameWithoutSpacesToExerciseTruncation',
    version: '2.0.0-alpha.1',
    category: 'database',
    license: null,
    downloads: 999,
  },
  {
    slug: 'build-metadata',
    name: 'SQL Export',
    description:
      'Export query results to CSV, JSON and Parquet with configurable formatting and streaming for large datasets.',
    author: 'Export Team',
    version: '3.2.1+build.2026-10-11',
    category: null,
    license: 'BSD-3-Clause',
    downloads: 12000,
    color: '#0d9488',
  },
  {
    slug: 'empty-description',
    name: 'Blank Description',
    description: '',
    author: 'Theme Team',
    version: '0.0.1',
    category: 'theme',
    license: null,
    downloads: 42,
    color: '#db2777',
  },
]

await connectDB(path)
const ownerId = 'layout-test-owner'
const now = Date.now()
await db.insert(users).values({ id: ownerId, displayName: 'Local layout fixtures' }).onConflictDoNothing()

for (const [index, fixture] of fixtures.entries()) {
  const id = `layout-test-${fixture.slug}`
  const homepage = `https://example.invalid/${id}`
  const iconUrl = fixture.color
    ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="${fixture.color}"/><text x="20" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" fill="white">${fixture.name.slice(0, 2).toUpperCase()}</text></svg>`)}`
    : null

  await db
    .insert(plugins)
    .values({
      id,
      ownerId,
      name: fixture.name,
      description: fixture.description,
      author: fixture.author,
      repoUrl: homepage,
      homepage,
      latestVersion: fixture.version,
      webhookSecret: crypto.randomUUID(),
      status: 'approved',
      category: fixture.category,
      license: fixture.license,
      iconUrl,
      tags: JSON.stringify(['layout-test']),
      downloads: fixture.downloads,
      verifiedAt: fixture.verified ? now : null,
      manifestVersion: fixture.version ?? 'layout-fixture',
      manifestFetchedAt: now,
      featured: index < 3 ? 1 : 0,
      featuredOrder: index < 3 ? index - 3 : null,
      readme: '# Local UI fixture\n\nThis plugin is test data for card layout checks. It has no downloadable driver.',
      createdAt: now - index,
      updatedAt: now - index,
    })
    .onConflictDoNothing()

  if (fixture.version) {
    await db
      .insert(releases)
      .values({ id: `${id}-release`, pluginId: id, version: fixture.version, assets: '{}' })
      .onConflictDoNothing()
  }
}

console.log(`Ready: ${fixtures.length} layout fixtures (existing entries are preserved).`)
console.log('Open http://localhost:5180/plugins?tag=layout-test')
