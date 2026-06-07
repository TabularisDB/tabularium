// Postgres mirror of schema.ts. See that file for the contract — core tables
// come from `@tabularium/core-schema/pg`; feature-specific ones stay here.
import { pgTable, text, integer, smallint, bigint, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core'
import { users, plugins } from '@tabularium/core-schema/pg'

const now = () => Date.now()
const ts = (name: string) => bigint(name, { mode: 'number' })

export * from '@tabularium/core-schema/pg'

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

export const pluginTransfers = pgTable(
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
    createdAt: ts('created_at').notNull().$defaultFn(now),
    expiresAt: ts('expires_at').notNull(),
    respondedAt: ts('responded_at'),
  },
  (t) => ({
    byTo: index('plugin_transfers_to_user_status_idx').on(t.toUserId, t.status),
    byFrom: index('plugin_transfers_from_user_status_idx').on(t.fromUserId, t.status),
  }),
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().$defaultFn(now),
    lastSeenAt: ts('last_seen_at').notNull().$defaultFn(now),
    revokedAt: ts('revoked_at'),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => ({
    byUser: index('sessions_user_id_idx').on(t.userId),
    byRevoked: index('sessions_revoked_idx').on(t.revokedAt),
  }),
)

export const publisherTokens = pgTable(
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

export const adminTokens = pgTable(
  'admin_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
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

// Email tables are owned by the email plugin (kernel-enforced prefix
// `pl_email__`). Re-exported here so drizzle-kit's migration generator picks
// them up via the dialect-specific schema entrypoint.
export { emailLog, emailPreferences, emailSuppression } from '@tabularium/plugin-email/schema.pg'

// Discord-notifier plugin tables — see schema.ts for the rename rationale.
export { webhookLog as discordNotifierWebhookLog } from '@tabularium/plugin-discord-notifier/schema.pg'
