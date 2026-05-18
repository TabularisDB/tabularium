/**
 * Postgres mirror of schema.sqlite.ts. Kept structurally identical column-by-column
 * so projection / drizzle-orm helpers (`eq`, `and`, …) stay portable.
 * Booleans stored as smallint (0/1) to mirror SQLite's integer-boolean convention,
 * so query code that treats `enabled === 1` stays correct across dialects.
 */
import { pgTable, text, integer, smallint, bigint, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core'

const now = () => Date.now()
// Postgres `bigint` returns string in postgres-js by default; we set typed transform in db client.
const ts = (name: string) => bigint(name, { mode: 'number' })

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const rootCredentials = pgTable('root_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const providerInstances = pgTable('provider_instances', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['github', 'gitlab', 'gitea'] }).notNull(),
  displayName: text('display_name').notNull(),
  baseUrl: text('base_url').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret').notNull(),
  logoUrl: text('logo_url'),
  enabled: smallint('enabled').notNull().default(1),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const identities = pgTable(
  'identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerInstanceId: text('provider_instance_id')
      .notNull()
      .references(() => providerInstances.id),
    externalId: text('external_id').notNull(),
    username: text('username').notNull(),
    accessToken: text('access_token'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueIdentity: uniqueIndex('identities_instance_external_unique').on(t.providerInstanceId, t.externalId),
  }),
)

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  providerInstanceId: text('provider_instance_id').references(() => providerInstances.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  author: text('author').notNull(),
  repoUrl: text('repo_url').notNull(),
  homepage: text('homepage').notNull(),
  latestVersion: text('latest_version'),
  webhookSecret: text('webhook_secret').notNull(),
  status: text('status', { enum: ['approved', 'pending', 'rejected'] })
    .notNull()
    .default('approved'),
  rejectionReason: text('rejection_reason'),
  category: text('category'),
  tags: text('tags'),
  license: text('license'),
  iconUrl: text('icon_url'),
  screenshots: text('screenshots'),
  readme: text('readme'),
  documentationUrl: text('documentation_url'),
  supportEmail: text('support_email'),
  issuesUrl: text('issues_url'),
  manifestFetchedAt: ts('manifest_fetched_at'),
  manifestVersion: text('manifest_version'),
  featured: smallint('featured').notNull().default(0),
  featuredOrder: integer('featured_order'),
  downloads: integer('downloads').notNull().default(0),
  createdAt: ts('created_at').notNull().$defaultFn(now),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const releases = pgTable(
  'releases',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id),
    version: text('version').notNull(),
    minRuntimeVersion: text('min_runtime_version'),
    assets: text('assets').notNull(),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueVersion: uniqueIndex('releases_plugin_version').on(t.pluginId, t.version),
  }),
)

export const releaseAssets = pgTable(
  'release_assets',
  {
    id: text('id').primaryKey(),
    releaseId: text('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    contentType: text('content_type'),
    arch: text('arch'),
    os: text('os'),
    attestationBundle: text('attestation_bundle'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueReleaseName: uniqueIndex('release_assets_release_name').on(t.releaseId, t.name),
  }),
)

export const pluginRequests = pgTable('plugin_requests', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  requesterId: text('requester_id')
    .notNull()
    .references(() => users.id),
  upvotes: integer('upvotes').notNull().default(0),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const pluginRequestVotes = pgTable(
  'plugin_request_votes',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => pluginRequests.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.requestId, t.userId] }),
  }),
)

export const pluginRequestClaims = pgTable(
  'plugin_request_claims',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => pluginRequests.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.requestId, t.userId] }),
  }),
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: smallint('encrypted').notNull().default(0),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const markdownPages = pgTable(
  'markdown_pages',
  {
    slug: text('slug').notNull(),
    locale: text('locale').notNull().default('en'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    published: smallint('published').notNull().default(1),
    path: text('path').notNull(),
    navOrder: integer('nav_order'),
    showInFooter: smallint('show_in_footer').notNull().default(0),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    updatedAt: ts('updated_at').notNull().$defaultFn(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.slug, t.locale] }),
    uniquePathLocale: uniqueIndex('markdown_pages_path_locale').on(t.path, t.locale),
  }),
)

export const pluginTransfers = pgTable('plugin_transfers', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id')
    .notNull()
    .references(() => plugins.id, { onDelete: 'cascade' }),
  fromUserId: text('from_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  toUserId: text('to_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] })
    .notNull()
    .default('pending'),
  message: text('message'),
  createdAt: ts('created_at').notNull().$defaultFn(now),
  expiresAt: ts('expires_at').notNull(),
  respondedAt: ts('responded_at'),
})

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: text('actor_name'),
  action: text('action').notNull(),
  target: text('target'),
  meta: text('meta'),
  ip: text('ip'),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const downloadEvents = pgTable(
  'download_events',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    platform: text('platform').notNull(),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byPluginCreated: uniqueIndex('download_events_plugin_created').on(t.pluginId, t.createdAt, t.id),
  }),
)
