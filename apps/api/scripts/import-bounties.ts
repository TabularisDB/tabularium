/**
 * One-off import of a hand-curated bounty board (the tabularis.dev
 * `pluginBounties.json` format) into plugin requests.
 *
 *   bun scripts/import-bounties.ts [file-or-url] [--map bounty=plugin ...] [--kind driver] [--dry-run]
 *
 * Runs against DATABASE_URL like the seed scripts. Each bounty becomes a
 * request keyed by its `id` (the slug): active ones `approved` with their
 * board metadata, shipped ones `fulfilled` and linked to the registry plugin
 * with the same id (or the one given with --map). Existing slugs are updated
 * in place, so the script can be re-run. Requests are filed by the first admin.
 */
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { connectDB, db } from '../src/db'
import { pluginRequests } from '../src/db/schema'
import type { Bounty } from '../src/lib/request-bounty'
import { parseBounty } from '../src/lib/request-bounty'

const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/TabularisDB/website/main/src/data/pluginBounties.json'
// Board entries whose plugin ships under a different id.
const DEFAULT_ALIASES: Record<string, string> = { 'sql-server': 'sqlserver', scylladb: 'cassandra' }

type SourceBounty = {
  id: string
  name: string
  target?: string
  status: string
  tagline?: string
  description: string
  stage?: string
  nextStep?: string
  difficulty?: Bounty['difficulty']
  accent?: string
  radar?: Bounty['radar']
  tags?: string[]
  capabilities?: Bounty['capabilities']
  signal?: string
  sponsorUrl?: string
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    map: { type: 'string', multiple: true },
    kind: { type: 'string', default: 'driver' },
    'dry-run': { type: 'boolean', default: false },
  },
})

const source = positionals[0] ?? DEFAULT_SOURCE
const aliases = { ...DEFAULT_ALIASES }
for (const pair of values.map ?? []) {
  const [from, to] = pair.split('=')
  if (from && to) aliases[from] = to
}
const dryRun = values['dry-run']

const raw = /^https?:\/\//.test(source) ? await (await fetch(source)).text() : await readFile(source, 'utf8')
const bounties = (JSON.parse(raw) as { bounties: SourceBounty[] }).bounties

await connectDB(process.env.DATABASE_URL ?? './data/registry.db')
const admin = await db.query.users.findFirst({ where: { role: 'admin' }, columns: { id: true } })
if (!admin) {
  console.error('No admin user to file the requests under — sign in once first.')
  process.exit(1)
}

function boardStatus(status: string): Bounty['boardStatus'] {
  if (status === 'most-wanted' || status === 'scoped' || status === 'coming-soon') return status
  // "claimed" referred to people outside the registry; claims are real users now.
  if (status === 'claimed') return 'scoped'
  return 'open'
}

function bountyOf(b: SourceBounty): Bounty {
  const bounty: Bounty = {
    boardStatus: boardStatus(b.status),
    tagline: b.tagline,
    stage: b.stage,
    nextStep: b.nextStep,
    difficulty: b.difficulty,
    accent: b.accent,
    radar: b.radar,
    tags: b.tags,
    capabilities: b.capabilities,
    signal: b.signal,
    sponsorUrl: b.sponsorUrl,
  }
  for (const key of Object.keys(bounty) as (keyof Bounty)[]) if (bounty[key] === undefined) delete bounty[key]
  return bounty
}

const now = Date.now()
const report = { created: 0, updated: 0, fulfilled: 0, skipped: [] as string[] }

for (const b of bounties) {
  const bounty = bountyOf(b)
  const stored = JSON.stringify(bounty)
  if (!parseBounty(stored)) {
    report.skipped.push(`${b.id} (bounty metadata does not match the schema)`)
    continue
  }

  let status: 'approved' | 'fulfilled' = 'approved'
  let fulfilledPluginId: string | null = null
  if (b.status === 'shipped') {
    status = 'fulfilled'
    const pluginId = aliases[b.id] ?? b.id
    const plugin = await db.query.plugins.findFirst({ where: { id: pluginId }, columns: { id: true } })
    // Built into the app (no plugin), still shown as shipped.
    fulfilledPluginId = plugin?.id ?? null
    if (!plugin) console.warn(`! ${b.id}: shipped without a registry plugin '${pluginId}', imported unlinked`)
  }

  const fields = {
    name: b.name.slice(0, 120),
    description: b.description.slice(0, 2000),
    kind: values.kind ?? null,
    status,
    bounty: stored,
    reviewedBy: admin.id,
    reviewedAt: now,
    fulfilledPluginId,
    fulfilledAt: status === 'fulfilled' ? now : null,
    updatedAt: now,
  }
  if (status === 'fulfilled') report.fulfilled++

  const existing = await db.query.pluginRequests.findFirst({ where: { slug: b.id }, columns: { id: true } })
  console.log(`${existing ? '~' : '+'} ${b.id} → ${status}${fulfilledPluginId ? ` (${fulfilledPluginId})` : ''}`)
  if (dryRun) continue
  if (existing) {
    await db.update(pluginRequests).set(fields).where(eq(pluginRequests.id, existing.id))
    report.updated++
  } else {
    await db.insert(pluginRequests).values({ id: ulid(), slug: b.id, requesterId: admin.id, ...fields })
    report.created++
  }
}

console.log(
  `\n${dryRun ? '[dry run] ' : ''}${report.created} created, ${report.updated} updated, ${report.fulfilled} shipped.`,
)
for (const s of report.skipped) console.warn(`skipped ${s}`)
process.exit(0)
