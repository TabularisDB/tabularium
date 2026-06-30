// MySQL mirror of schema.ts. varchar lengths are generous; swap to text if your
// MySQL is on a row-size-limited storage engine.
import { mysqlTable, text, varchar, int, tinyint, bigint, uniqueIndex, index, primaryKey } from 'drizzle-orm/mysql-core'

const now = () => Date.now()
const ts = (name: string) => bigint(name, { mode: 'number' })
const id = (name: string) => varchar(name, { length: 64 })

export const users = mysqlTable('users', {
  id: id('id').primaryKey(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
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
    // Canonical raw .tabularium bytes — see schema.ts for rationale.
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

export const pluginRequests = mysqlTable('plugin_requests', {
  id: id('id').primaryKey(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  requesterId: id('requester_id')
    .notNull()
    .references(() => users.id),
  upvotes: int('upvotes').notNull().default(0),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const pluginRequestVotes = mysqlTable(
  'plugin_request_votes',
  {
    requestId: id('request_id')
      .notNull()
      .references(() => pluginRequests.id),
    userId: id('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.requestId, t.userId] }),
  }),
)

export const pluginRequestClaims = mysqlTable(
  'plugin_request_claims',
  {
    requestId: id('request_id')
      .notNull()
      .references(() => pluginRequests.id, { onDelete: 'cascade' }),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.requestId, t.userId] }),
  }),
)

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 120 }).primaryKey(),
  value: text('value').notNull(),
  encrypted: tinyint('encrypted').notNull().default(0),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const markdownPages = mysqlTable(
  'markdown_pages',
  {
    slug: varchar('slug', { length: 80 }).notNull(),
    locale: varchar('locale', { length: 16 }).notNull().default('en'),
    title: varchar('title', { length: 120 }).notNull(),
    content: text('content').notNull(),
    published: tinyint('published').notNull().default(1),
    path: varchar('path', { length: 200 }).notNull(),
    navOrder: int('nav_order'),
    showInFooter: tinyint('show_in_footer').notNull().default(0),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    updatedAt: ts('updated_at').notNull().$defaultFn(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.slug, t.locale] }),
    uniquePathLocale: uniqueIndex('markdown_pages_path_locale').on(t.path, t.locale),
  }),
)

export const pluginTransfers = mysqlTable(
  'plugin_transfers',
  {
    id: id('id').primaryKey(),
    pluginId: varchar('plugin_id', { length: 80 })
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    fromUserId: id('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: id('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 16, enum: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] })
      .notNull()
      .default('pending'),
    message: varchar('message', { length: 500 }),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    expiresAt: ts('expires_at').notNull(),
    respondedAt: ts('responded_at'),
  },
  (t) => ({
    byTo: index('plugin_transfers_to_user_status_idx').on(t.toUserId, t.status),
    byFrom: index('plugin_transfers_from_user_status_idx').on(t.fromUserId, t.status),
  }),
)

export const sessions = mysqlTable(
  'sessions',
  {
    id: id('id').primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    lastSeenAt: ts('last_seen_at').notNull().$defaultFn(now),
    revokedAt: ts('revoked_at'),
    userAgent: varchar('user_agent', { length: 500 }),
    ip: varchar('ip', { length: 64 }),
  },
  (t) => ({
    byUser: index('sessions_user_id_idx').on(t.userId),
    byRevoked: index('sessions_revoked_idx').on(t.revokedAt),
  }),
)

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

export const publisherTokens = mysqlTable(
  'publisher_tokens',
  {
    id: id('id').primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    prefix: varchar('prefix', { length: 24 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: ts('expires_at'),
    lastUsedAt: ts('last_used_at'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    revokedAt: ts('revoked_at'),
  },
  (t) => ({
    byUser: index('publisher_tokens_user_idx').on(t.userId),
    byHash: uniqueIndex('publisher_tokens_hash_uniq').on(t.tokenHash),
  }),
)

export const adminTokens = mysqlTable(
  'admin_tokens',
  {
    id: id('id').primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    prefix: varchar('prefix', { length: 24 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    scopes: text('scopes'),
    expiresAt: ts('expires_at'),
    lastUsedAt: ts('last_used_at'),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    revokedAt: ts('revoked_at'),
  },
  (t) => ({
    byUser: index('admin_tokens_user_idx').on(t.userId),
    byHash: uniqueIndex('admin_tokens_hash_uniq').on(t.tokenHash),
  }),
)

export const downloadEvents = mysqlTable(
  'download_events',
  {
    id: id('id').primaryKey(),
    pluginId: id('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    version: varchar('version', { length: 80 }).notNull(),
    platform: varchar('platform', { length: 40 }).notNull(),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byPluginCreated: uniqueIndex('download_events_plugin_created').on(t.pluginId, t.createdAt, t.id),
  }),
)

export const emailLog = mysqlTable(
  'email_log',
  {
    id: id('id').primaryKey(),
    userId: id('user_id').references(() => users.id, { onDelete: 'set null' }),
    trigger: varchar('trigger', { length: 80 }).notNull(),
    template: varchar('template', { length: 80 }).notNull(),
    locale: varchar('locale', { length: 16 }).notNull(),
    toAddress: varchar('to_address', { length: 320 }).notNull(),
    fromAddress: varchar('from_address', { length: 320 }).notNull(),
    subject: varchar('subject', { length: 500 }).notNull(),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerMid: varchar('provider_mid', { length: 255 }),
    status: varchar('status', { length: 40 }).notNull(),
    error: text('error'),
    sentAt: ts('sent_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byUserSent: index('email_log_user_sent_idx').on(t.userId, t.sentAt),
    byMid: index('email_log_mid_idx').on(t.providerMid),
    byTrigger: index('email_log_trigger_idx').on(t.trigger, t.sentAt),
  }),
)
