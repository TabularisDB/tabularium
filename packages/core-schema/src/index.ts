// @tabularium/core-schema — shared Drizzle schema (SQLite).
//
// These are the core tables plugins reference. Plugins import `users` (etc.)
// from `@tabularium/core-schema` and FK against them in their own table
// definitions. Apps/api re-exports everything from this module so drizzle-kit
// keeps reading a single schema entrypoint per dialect.
//
// Plugin contract: TS modules under Bun + Elysia + Drizzle. That's the only
// supported plugin shape — no Wasm, no JSON manifest interpreters.
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

const now = () => Date.now()

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  email: text('email').unique(),
  locale: text('locale').notNull().default('en'),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
})

export const rootCredentials = sqliteTable('root_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(now),
})

export const providerInstances = sqliteTable('provider_instances', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['github', 'gitlab', 'gitea'] }).notNull(),
  displayName: text('display_name').notNull(),
  baseUrl: text('base_url').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret').notNull(),
  logoUrl: text('logo_url'),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull().$defaultFn(now),
})

export const identities = sqliteTable(
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
    accessTokenExpiresAt: integer('access_token_expires_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueIdentity: uniqueIndex('identities_instance_external_unique').on(t.providerInstanceId, t.externalId),
    byUser: index('identities_user_id_idx').on(t.userId),
  }),
)

export const plugins = sqliteTable(
  'plugins',
  {
    id: text('id').primaryKey(), // slug
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
    // .tabularium manifest fields (re-fetched on every release webhook).
    category: text('category'),
    tags: text('tags'), // JSON-encoded string[] — kept as JSON for portability across dialects.
    license: text('license'),
    iconUrl: text('icon_url'),
    screenshots: text('screenshots'), // JSON [{ url, caption?, alt? }]
    // Inter-plugin dependencies declared in the manifest's `requires[]`.
    // Stored as JSON for portability across dialects:
    // `Array<{ id: string; version?: string; optional?: boolean; reason?: string }>`.
    // Surfaced on `/api/plugins/:slug` so consumers can review the dependency
    // graph before installing. Admins can disable end-to-end ingest of this
    // field via `plugins.requires_allowed=false`, in which case the column
    // stays NULL even when authors submit a non-empty list.
    requires: text('requires'),
    readme: text('readme'), // raw markdown — pre-rendered to HTML on request
    documentationUrl: text('documentation_url'),
    supportEmail: text('support_email'),
    issuesUrl: text('issues_url'),
    manifestFetchedAt: integer('manifest_fetched_at'),
    manifestVersion: text('manifest_version'), // tag/sha the manifest was last read at
    // JSON-encoded admin-defined extension fields from the manifest
    // (engine, paradigms, capabilities, settings, … — anything not in the
    // core schema). Captured at ingest, surfaced raw to API consumers.
    extensions: text('extensions'),
    // Admin pinning for landing "featured" slot.
    featured: integer('featured').notNull().default(0),
    featuredOrder: integer('featured_order'),
    // Admin audit verification — independent of `status`. Stays until admin
    // revokes; new releases do not reset it. `verifiedAt IS NOT NULL` IS the
    // verified state — no separate boolean (would be redundant + drift-prone).
    verifiedAt: integer('verified_at'),
    verifiedBy: text('verified_by').references(() => users.id, { onDelete: 'set null' }),
    // Resolved-asset hits via /api/plugins/:slug/latest. Direct repo-asset
    // clicks aren't counted (we don't proxy them).
    downloads: integer('downloads').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
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

export const releases = sqliteTable(
  'releases',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id),
    version: text('version').notNull(),
    minRuntimeVersion: text('min_runtime_version'),
    yankedAt: integer('yanked_at'),
    yankedBy: text('yanked_by').references(() => users.id, { onDelete: 'set null' }),
    yankReason: text('yank_reason'),
    assets: text('assets').notNull(), // JSON string
    manifestSha256: text('manifest_sha256'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueVersion: uniqueIndex('releases_plugin_version').on(t.pluginId, t.version),
    byPluginCreated: index('releases_plugin_created_idx').on(t.pluginId, t.createdAt),
    byYankedAt: index('releases_yanked_at_idx').on(t.yankedAt),
  }),
)

export const releaseAssets = sqliteTable(
  'release_assets',
  {
    id: text('id').primaryKey(),
    releaseId: text('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    contentType: text('content_type'),
    arch: text('arch'),
    os: text('os'),
    attestationBundle: text('attestation_bundle'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueReleaseName: uniqueIndex('release_assets_release_name').on(t.releaseId, t.name),
  }),
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted').notNull().default(0),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    target: text('target'),
    meta: text('meta'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byCreated: index('audit_log_created_at_idx').on(t.createdAt),
    byActorCreated: index('audit_log_actor_created_idx').on(t.actorId, t.createdAt),
    byTarget: index('audit_log_target_idx').on(t.target),
  }),
)
