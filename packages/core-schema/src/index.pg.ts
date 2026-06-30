// @tabularium/core-schema — shared Drizzle schema (Postgres mirror).
//
// See ./index.ts for the contract. Booleans live as smallint (0/1) so
// cross-dialect query code like `eq(x.enabled, 1)` stays valid against any
// driver.
import { pgTable, text, integer, smallint, bigint, uniqueIndex, index } from 'drizzle-orm/pg-core'

const now = () => Date.now()
// Postgres `bigint` returns string in postgres-js by default; we set typed transform in db client.
const ts = (name: string) => bigint(name, { mode: 'number' })

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  email: text('email').unique(),
  locale: text('locale').notNull().default('en'),
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
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueIdentity: uniqueIndex('identities_instance_external_unique').on(t.providerInstanceId, t.externalId),
    byUser: index('identities_user_id_idx').on(t.userId),
  }),
)

export const plugins = pgTable(
  'plugins',
  {
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
    requires: text('requires'),
    readme: text('readme'),
    documentationUrl: text('documentation_url'),
    supportEmail: text('support_email'),
    issuesUrl: text('issues_url'),
    manifestFetchedAt: ts('manifest_fetched_at'),
    manifestVersion: text('manifest_version'),
    extensions: text('extensions'),
    featured: smallint('featured').notNull().default(0),
    featuredOrder: integer('featured_order'),
    verifiedAt: ts('verified_at'),
    verifiedBy: text('verified_by').references(() => users.id, { onDelete: 'set null' }),
    downloads: integer('downloads').notNull().default(0),
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

export const releases = pgTable(
  'releases',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id),
    version: text('version').notNull(),
    minRuntimeVersion: text('min_runtime_version'),
    yankedAt: ts('yanked_at'),
    yankedBy: text('yanked_by').references(() => users.id, { onDelete: 'set null' }),
    yankReason: text('yank_reason'),
    assets: text('assets').notNull(),
    manifestSha256: text('manifest_sha256'),
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

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: smallint('encrypted').notNull().default(0),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    target: text('target'),
    meta: text('meta'),
    ip: text('ip'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byCreated: index('audit_log_created_at_idx').on(t.createdAt),
    byActorCreated: index('audit_log_actor_created_idx').on(t.actorId, t.createdAt),
    byTarget: index('audit_log_target_idx').on(t.target),
  }),
)
