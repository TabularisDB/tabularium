// src/db/schema.ts
import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core'

const now = () => Date.now()

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
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
    readme: text('readme'), // raw markdown — pre-rendered to HTML on request
    documentationUrl: text('documentation_url'),
    supportEmail: text('support_email'),
    issuesUrl: text('issues_url'),
    manifestFetchedAt: integer('manifest_fetched_at'),
    manifestVersion: text('manifest_version'), // tag/sha the manifest was last read at
    // Admin pinning for landing "featured" slot.
    featured: integer('featured').notNull().default(0),
    featuredOrder: integer('featured_order'),
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
    assets: text('assets').notNull(), // JSON string
    manifestSha256: text('manifest_sha256'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    uniqueVersion: uniqueIndex('releases_plugin_version').on(t.pluginId, t.version),
    byPluginCreated: index('releases_plugin_created_idx').on(t.pluginId, t.createdAt),
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

export const pluginRequests = sqliteTable('plugin_requests', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  requesterId: text('requester_id')
    .notNull()
    .references(() => users.id),
  upvotes: integer('upvotes').notNull().default(0),
  createdAt: integer('created_at').notNull().$defaultFn(now),
})

export const pluginRequestVotes = sqliteTable(
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

export const pluginRequestClaims = sqliteTable(
  'plugin_request_claims',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => pluginRequests.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.requestId, t.userId] }),
  }),
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted').notNull().default(0),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

export const markdownPages = sqliteTable(
  'markdown_pages',
  {
    slug: text('slug').notNull(),
    locale: text('locale').notNull().default('en'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    published: integer('published').notNull().default(1),
    path: text('path').notNull(),
    navOrder: integer('nav_order'),
    showInFooter: integer('show_in_footer').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.slug, t.locale] }),
    uniquePathLocale: uniqueIndex('markdown_pages_path_locale').on(t.path, t.locale),
  }),
)

export const pluginTransfers = sqliteTable(
  'plugin_transfers',
  {
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
    createdAt: integer('created_at').notNull().$defaultFn(now),
    expiresAt: integer('expires_at').notNull(),
    respondedAt: integer('responded_at'),
  },
  (t) => ({
    byTo: index('plugin_transfers_to_user_status_idx').on(t.toUserId, t.status),
    byFrom: index('plugin_transfers_from_user_status_idx').on(t.fromUserId, t.status),
  }),
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(), // also the JWT `jti`
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    lastSeenAt: integer('last_seen_at').notNull().$defaultFn(now),
    revokedAt: integer('revoked_at'),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => ({
    byUser: index('sessions_user_id_idx').on(t.userId),
    byRevoked: index('sessions_revoked_idx').on(t.revokedAt),
  }),
)

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

// Long-lived admin API tokens (M2M). The plaintext token is only ever
// returned at creation time; we store the sha256 hash plus a short prefix
// for display in the listing UI.
export const adminTokens = sqliteTable(
  'admin_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: text('scopes'), // JSON array of scope strings; null = full admin
    expiresAt: integer('expires_at'),
    lastUsedAt: integer('last_used_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    revokedAt: integer('revoked_at'),
  },
  (t) => ({
    byUser: index('admin_tokens_user_idx').on(t.userId),
    byHash: uniqueIndex('admin_tokens_hash_uniq').on(t.tokenHash),
  }),
)

// One row per resolved /latest hit. No PII — just enough to plot
// download trends per plugin/platform/version over time.
export const downloadEvents = sqliteTable(
  'download_events',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    platform: text('platform').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byPluginCreated: uniqueIndex('download_events_plugin_created').on(t.pluginId, t.createdAt, t.id),
  }),
)
