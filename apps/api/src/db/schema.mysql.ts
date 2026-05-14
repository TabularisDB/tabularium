/**
 * MySQL mirror of schema.sqlite.ts.
 * Kept structurally identical column-by-column. `varchar` lengths picked generously since the
 * upstream values are unbounded (slugs, urls, ulids); switch to `text` if your MySQL is on
 * row-size-limited storage.
 */
import {
  mysqlTable, text, varchar, int, tinyint, bigint, uniqueIndex, primaryKey,
} from 'drizzle-orm/mysql-core'

const now = () => Date.now()
const ts = (name: string) => bigint(name, { mode: 'number' })
const id = (name: string) => varchar(name, { length: 64 })

export const users = mysqlTable('users', {
  id: id('id').primaryKey(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  role: varchar('role', { length: 16, enum: ['user', 'admin'] }).notNull().default('user'),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const rootCredentials = mysqlTable('root_credentials', {
  userId: id('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
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

export const identities = mysqlTable('identities', {
  id: id('id').primaryKey(),
  userId: id('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerInstanceId: id('provider_instance_id').notNull().references(() => providerInstances.id),
  externalId: varchar('external_id', { length: 120 }).notNull(),
  username: varchar('username', { length: 120 }).notNull(),
  accessToken: text('access_token'),
  createdAt: ts('created_at').notNull().$defaultFn(now),
}, (t) => ({
  uniqueIdentity: uniqueIndex('identities_instance_external_unique')
    .on(t.providerInstanceId, t.externalId),
}))

export const plugins = mysqlTable('plugins', {
  id: varchar('id', { length: 80 }).primaryKey(),
  ownerId: id('owner_id').notNull().references(() => users.id),
  providerInstanceId: id('provider_instance_id').references(() => providerInstances.id),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  author: varchar('author', { length: 500 }).notNull(),
  repoUrl: varchar('repo_url', { length: 500 }).notNull(),
  homepage: varchar('homepage', { length: 500 }).notNull(),
  latestVersion: varchar('latest_version', { length: 40 }),
  webhookSecret: varchar('webhook_secret', { length: 128 }).notNull(),
  status: varchar('status', { length: 16, enum: ['approved', 'pending', 'rejected'] }).notNull().default('approved'),
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
  featured: tinyint('featured').notNull().default(0),
  featuredOrder: int('featured_order'),
  createdAt: ts('created_at').notNull().$defaultFn(now),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const releases = mysqlTable('releases', {
  id: id('id').primaryKey(),
  pluginId: varchar('plugin_id', { length: 80 }).notNull().references(() => plugins.id),
  version: varchar('version', { length: 40 }).notNull(),
  minRuntimeVersion: varchar('min_runtime_version', { length: 40 }),
  assets: text('assets').notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(now),
}, (t) => ({
  uniqueVersion: uniqueIndex('releases_plugin_version').on(t.pluginId, t.version),
}))

export const pluginRequests = mysqlTable('plugin_requests', {
  id: id('id').primaryKey(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  requesterId: id('requester_id').notNull().references(() => users.id),
  upvotes: int('upvotes').notNull().default(0),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

export const pluginRequestVotes = mysqlTable('plugin_request_votes', {
  requestId: id('request_id').notNull().references(() => pluginRequests.id),
  userId: id('user_id').notNull().references(() => users.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.requestId, t.userId] }),
}))

export const pluginRequestClaims = mysqlTable('plugin_request_claims', {
  requestId: id('request_id').notNull().references(() => pluginRequests.id, { onDelete: 'cascade' }),
  userId: id('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().$defaultFn(now),
}, (t) => ({
  pk: primaryKey({ columns: [t.requestId, t.userId] }),
}))

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 120 }).primaryKey(),
  value: text('value').notNull(),
  encrypted: tinyint('encrypted').notNull().default(0),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const markdownPages = mysqlTable('markdown_pages', {
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
}, (t) => ({
  pk: primaryKey({ columns: [t.slug, t.locale] }),
  uniquePathLocale: uniqueIndex('markdown_pages_path_locale').on(t.path, t.locale),
}))

export const pluginTransfers = mysqlTable('plugin_transfers', {
  id: id('id').primaryKey(),
  pluginId: varchar('plugin_id', { length: 80 }).notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  fromUserId: id('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: id('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16, enum: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] }).notNull().default('pending'),
  message: varchar('message', { length: 500 }),
  createdAt: ts('created_at').notNull().$defaultFn(now),
  expiresAt: ts('expires_at').notNull(),
  respondedAt: ts('responded_at'),
})

export const auditLog = mysqlTable('audit_log', {
  id: id('id').primaryKey(),
  actorId: id('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: varchar('actor_name', { length: 120 }),
  action: varchar('action', { length: 80 }).notNull(),
  target: varchar('target', { length: 200 }),
  meta: text('meta'),
  ip: varchar('ip', { length: 64 }),
  createdAt: ts('created_at').notNull().$defaultFn(now),
})

