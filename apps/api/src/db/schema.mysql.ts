// MySQL mirror of schema.ts. See that file for the contract — core tables
// come from `@tabularium/core-schema/mysql`; feature-specific ones stay here.
import { mysqlTable, text, varchar, int, tinyint, bigint, uniqueIndex, index, primaryKey } from 'drizzle-orm/mysql-core'
import { users, plugins } from '@tabularium/core-schema/mysql'

const now = () => Date.now()
const ts = (name: string) => bigint(name, { mode: 'number' })
const id = (name: string) => varchar(name, { length: 64 })

export * from '@tabularium/core-schema/mysql'

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

// Email tables are owned by the email plugin (kernel-enforced prefix
// `pl_email__`). Re-exported here so drizzle-kit's migration generator picks
// them up via the dialect-specific schema entrypoint.
export { emailLog, emailPreferences, emailSuppression } from '@tabularium/plugin-email/schema.mysql'
