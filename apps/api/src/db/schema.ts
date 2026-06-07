// src/db/schema.ts — drizzle-kit reads this as the single entrypoint.
//
// Core tables (users, plugins, releases, settings, audit_log, etc.) now live
// in `@tabularium/core-schema` so plugins can FK against them without
// reaching back into apps/api. Re-exported here so the migration generator
// keeps seeing one merged surface per dialect.
//
// Tables that only the api app cares about (or that aren't a sensible FK
// target for plugins yet) stay defined here.
import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core'
import { users, plugins } from '@tabularium/core-schema'

const now = () => Date.now()

export * from '@tabularium/core-schema'

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

// Publisher tokens for CI-driven release publishing. Scoped to specific
// plugins or account-wide via `scopes` JSON array. `scopes` is NEVER null
// here — unscoped tokens would be too dangerous.
export const publisherTokens = sqliteTable(
  'publisher_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: integer('expires_at'),
    lastUsedAt: integer('last_used_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    revokedAt: integer('revoked_at'),
  },
  (t) => ({
    byUser: index('publisher_tokens_user_idx').on(t.userId),
    byHash: uniqueIndex('publisher_tokens_hash_uniq').on(t.tokenHash),
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

// Email tables are owned by the email plugin (kernel-enforced prefix
// `pl_email__`). Re-exported here so drizzle-kit's migration generator
// picks them up — drizzle-kit reads a single schema entrypoint per dialect
// and surfaces every exported table from it.
export { emailLog, emailPreferences, emailSuppression } from '@tabularium/plugin-email/schema'
