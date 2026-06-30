// @tabularium/core-schema — shared Drizzle schema (MySQL mirror).
//
// See ./index.ts for the contract. varchar lengths are generous; swap to text
// if your MySQL is on a row-size-limited storage engine.
import { mysqlTable, text, varchar, int, tinyint, bigint, uniqueIndex, index } from 'drizzle-orm/mysql-core'

const now = () => Date.now()
const ts = (name: string) => bigint(name, { mode: 'number' })
const id = (name: string) => varchar(name, { length: 64 })

export const users = mysqlTable('users', {
  id: id('id').primaryKey(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  email: varchar('email', { length: 320 }).unique(),
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
  role: varchar('role', { length: 16, enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const rootCredentials = mysqlTable('root_credentials', {
  userId: id('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const providerInstances = mysqlTable('provider_instances', {
  id: id('id').primaryKey(),
  kind: varchar('kind', { length: 16, enum: ['github', 'gitlab', 'gitea'] }).notNull(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  baseUrl: varchar('base_url', { length: 500 }).notNull(),
  clientId: varchar('client_id', { length: 500 }).notNull(),
  clientSecret: text('client_secret').notNull(),
  logoUrl: varchar('logo_url', { length: 500 }),
  enabled: tinyint('enabled').notNull().default(1),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const identities = mysqlTable(
  'identities',
  {
    id: id('id').primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerInstanceId: id('provider_instance_id')
      .notNull()
      .references(() => providerInstances.id),
    externalId: varchar('external_id', { length: 120 }).notNull(),
    username: varchar('username', { length: 120 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueIdentity: uniqueIndex('identities_instance_external_unique').on(t.providerInstanceId, t.externalId),
    byUser: index('identities_user_id_idx').on(t.userId),
  }),
)

export const plugins = mysqlTable(
  'plugins',
  {
    id: varchar('id', { length: 80 }).primaryKey(),
    ownerId: id('owner_id')
      .notNull()
      .references(() => users.id),
    providerInstanceId: id('provider_instance_id').references(() => providerInstances.id),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    author: varchar('author', { length: 500 }).notNull(),
    repoUrl: varchar('repo_url', { length: 500 }).notNull(),
    homepage: varchar('homepage', { length: 500 }).notNull(),
    latestVersion: varchar('latest_version', { length: 40 }),
    webhookSecret: varchar('webhook_secret', { length: 128 }).notNull(),
    status: varchar('status', { length: 16, enum: ['approved', 'pending', 'rejected'] })
      .notNull()
      .default('approved'),
    rejectionReason: varchar('rejection_reason', { length: 500 }),
    category: varchar('category', { length: 40 }),
    tags: text('tags'),
    license: varchar('license', { length: 40 }),
    iconUrl: varchar('icon_url', { length: 500 }),
    screenshots: text('screenshots'),
    requires: text('requires'),
    readme: text('readme'),
    documentationUrl: varchar('documentation_url', { length: 500 }),
    supportEmail: varchar('support_email', { length: 254 }),
    issuesUrl: varchar('issues_url', { length: 500 }),
    manifestFetchedAt: ts('manifest_fetched_at'),
    manifestVersion: varchar('manifest_version', { length: 80 }),
    extensions: text('extensions'),
    featured: tinyint('featured').notNull().default(0),
    featuredOrder: int('featured_order'),
    verifiedAt: ts('verified_at'),
    verifiedBy: id('verified_by').references(() => users.id, { onDelete: 'set null' }),
    downloads: int('downloads').notNull().default(0),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    updatedAt: ts('updated_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byStatus: index('plugins_status_idx').on(t.status),
    byOwner: index('plugins_owner_id_idx').on(t.ownerId),
    byProvider: index('plugins_provider_instance_id_idx').on(t.providerInstanceId),
    byCategory: index('plugins_category_idx').on(t.category),
    byUpdated: index('plugins_updated_at_idx').on(t.updatedAt),
    byFeatured: index('plugins_featured_idx').on(t.featured, t.featuredOrder),
    byVerifiedAt: index('plugins_verified_at_idx').on(t.verifiedAt),
  }),
)

export const releases = mysqlTable(
  'releases',
  {
    id: id('id').primaryKey(),
    pluginId: varchar('plugin_id', { length: 80 })
      .notNull()
      .references(() => plugins.id),
    version: varchar('version', { length: 40 }).notNull(),
    minRuntimeVersion: varchar('min_runtime_version', { length: 40 }),
    yankedAt: ts('yanked_at'),
    yankedBy: id('yanked_by').references(() => users.id, { onDelete: 'set null' }),
    yankReason: text('yank_reason'),
    assets: text('assets').notNull(),
    manifestSha256: varchar('manifest_sha256', { length: 64 }),
    // Canonical raw .tabularium bytes — see index.ts for rationale.
    manifestRaw: text('manifest_raw'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueVersion: uniqueIndex('releases_plugin_version').on(t.pluginId, t.version),
    byPluginCreated: index('releases_plugin_created_idx').on(t.pluginId, t.createdAt),
    byYankedAt: index('releases_yanked_at_idx').on(t.yankedAt),
  }),
)

export const releaseAssets = mysqlTable(
  'release_assets',
  {
    id: id('id').primaryKey(),
    releaseId: id('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    contentType: varchar('content_type', { length: 120 }),
    arch: varchar('arch', { length: 40 }),
    os: varchar('os', { length: 40 }),
    attestationBundle: text('attestation_bundle'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueReleaseName: uniqueIndex('release_assets_release_name').on(t.releaseId, t.name),
  }),
)

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 120 }).primaryKey(),
  value: text('value').notNull(),
  encrypted: tinyint('encrypted').notNull().default(0),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const auditLog = mysqlTable(
  'audit_log',
  {
    id: id('id').primaryKey(),
    actorId: id('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 120 }),
    action: varchar('action', { length: 80 }).notNull(),
    target: varchar('target', { length: 200 }),
    meta: text('meta'),
    ip: varchar('ip', { length: 64 }),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byCreated: index('audit_log_created_at_idx').on(t.createdAt),
    byActorCreated: index('audit_log_actor_created_idx').on(t.actorId, t.createdAt),
    byTarget: index('audit_log_target_idx').on(t.target),
  }),
)
