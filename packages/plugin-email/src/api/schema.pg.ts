// Postgres mirror of schema.ts — see that file for the table-prefix rationale.
import { pgTable, text, bigint, index } from 'drizzle-orm/pg-core'
import { pluginTablePrefix } from '@tabularium/plugin-host-types'
import { users } from '../../../../apps/api/src/db/schema.pg'

const PREFIX = pluginTablePrefix('email')
// `pl_email__`

const now = () => Date.now()
const ts = (name: string) => bigint(name, { mode: 'number' })

export const emailLog = pgTable(
  `${PREFIX}log`,
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    trigger: text('trigger').notNull(),
    template: text('template').notNull(),
    locale: text('locale').notNull(),
    toAddress: text('to_address').notNull(),
    fromAddress: text('from_address').notNull(),
    subject: text('subject').notNull(),
    provider: text('provider').notNull(),
    providerMid: text('provider_mid'),
    status: text('status').notNull(),
    error: text('error'),
    sentAt: ts('sent_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byUserSent: index(`${PREFIX}log_user_sent_idx`).on(t.userId, t.sentAt),
    byMid: index(`${PREFIX}log_mid_idx`).on(t.providerMid),
    byTrigger: index(`${PREFIX}log_trigger_idx`).on(t.trigger, t.sentAt),
  }),
)

export const emailPreferences = pgTable(`${PREFIX}preferences`, {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: text('prefs').notNull(),
  tokenNonce: text('token_nonce').notNull(),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
})

export const emailSuppression = pgTable(
  `${PREFIX}suppression`,
  {
    email: text('email').primaryKey(),
    source: text('source', { enum: ['bounce', 'complaint', 'manual', 'unsubscribe'] }).notNull(),
    reason: text('reason'),
    addedAt: ts('added_at').notNull().$defaultFn(now),
  },
  (t) => ({ bySource: index(`${PREFIX}suppression_source_idx`).on(t.source) }),
)
