// src/db/schema.ts
import {
  sqliteTable, text, integer, uniqueIndex, primaryKey
} from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['github', 'gitea'] }).notNull(),
  providerInstanceUrl: text('provider_instance_url'),
  externalId: text('external_id').notNull(),
  username: text('username').notNull(),
  accessToken: text('access_token'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqueProvider: uniqueIndex('users_provider_unique')
    .on(t.provider, t.providerInstanceUrl, t.externalId),
}))

export const plugins = sqliteTable('plugins', {
  id: text('id').primaryKey(), // slug
  ownerId: text('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  author: text('author').notNull(),
  repoUrl: text('repo_url').notNull(),
  homepage: text('homepage').notNull(),
  latestVersion: text('latest_version'), // nullable until first webhook
  webhookSecret: text('webhook_secret').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
})

export const releases = sqliteTable('releases', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull().references(() => plugins.id),
  version: text('version').notNull(),
  minTabularisVersion: text('min_tabularis_version'),
  assets: text('assets').notNull(), // JSON string
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqueVersion: uniqueIndex('releases_plugin_version').on(t.pluginId, t.version),
}))

export const challenges = sqliteTable('challenges', {
  token: text('token').primaryKey(),
  repoUrl: text('repo_url').notNull(),
  userId: text('user_id').references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
  verified: integer('verified').notNull().default(0),
})

export const pluginRequests = sqliteTable('plugin_requests', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  requesterId: text('requester_id').notNull().references(() => users.id),
  upvotes: integer('upvotes').notNull().default(0),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
})

export const pluginRequestVotes = sqliteTable('plugin_request_votes', {
  requestId: text('request_id').notNull().references(() => pluginRequests.id),
  userId: text('user_id').notNull().references(() => users.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.requestId, t.userId] }),
}))

// Relations (required for db.query.* relational API)
export const usersRelations = relations(users, ({ many }) => ({
  plugins: many(plugins),
}))

export const pluginsRelations = relations(plugins, ({ one, many }) => ({
  owner: one(users, { fields: [plugins.ownerId], references: [users.id] }),
  releases: many(releases),
}))

export const releasesRelations = relations(releases, ({ one }) => ({
  plugin: one(plugins, { fields: [releases.pluginId], references: [plugins.id] }),
}))

export const pluginRequestsRelations = relations(pluginRequests, ({ many }) => ({
  votes: many(pluginRequestVotes),
}))
