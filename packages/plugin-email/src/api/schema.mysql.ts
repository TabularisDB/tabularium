// MySQL mirror of schema.ts — see that file for the table-prefix rationale.
import { mysqlTable, text, varchar, bigint, index } from 'drizzle-orm/mysql-core'
import { pluginTablePrefix } from '@tabularium/plugin-host-types'
import { users } from '../../../../apps/api/src/db/schema.mysql'

const PREFIX = pluginTablePrefix('email')
// `pl_email__`

const now = () => Date.now()
const ts = (name: string) => bigint(name, { mode: 'number' })
const id = (name: string) => varchar(name, { length: 64 })

export const emailLog = mysqlTable(
  `${PREFIX}log`,
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
    byUserSent: index(`${PREFIX}log_user_sent_idx`).on(t.userId, t.sentAt),
    byMid: index(`${PREFIX}log_mid_idx`).on(t.providerMid),
    byTrigger: index(`${PREFIX}log_trigger_idx`).on(t.trigger, t.sentAt),
  }),
)

export const emailPreferences = mysqlTable(`${PREFIX}preferences`, {
  userId: id('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: text('prefs').notNull(),
  tokenNonce: varchar('token_nonce', { length: 64 }).notNull(),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const emailSuppression = mysqlTable(
  `${PREFIX}suppression`,
  {
    email: varchar('email', { length: 320 }).primaryKey(),
    source: varchar('source', { length: 16, enum: ['bounce', 'complaint', 'manual', 'unsubscribe'] }).notNull(),
    reason: text('reason'),
    addedAt: ts('added_at').notNull().$defaultFn(now),
  },
  (t) => ({ bySource: index(`${PREFIX}suppression_source_idx`).on(t.source) }),
)
