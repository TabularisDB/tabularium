// Email plugin tables — kernel-enforced prefix `pl_email__`.
//
// The TS export names (`emailLog`, `emailPreferences`, `emailSuppression`)
// stay identical to the historic core-schema names so call sites don't
// change. Only the DB table + index names get the prefix.
//
// Format: `pl_<plugin_id_normalized>__<table>` — computed via the kernel
// helper so the plugin author can't pick the prefix (and so two plugins
// cannot ever share one — duplicate ids are rejected by the loader).
//
// FK target `users` is read from the core schema. This is the only remaining
// reach-back into apps/api: the email plugin doesn't *own* the users table,
// it just references it. The schema-package extraction is a future SP cleanup.

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { pluginTablePrefix } from '@tabularium/plugin-host-types'
import { users } from '../../../../apps/api/src/db/schema'

// Re-export the FK target so plugin call sites can read users via the
// plugin's `schema` namespace without reaching into the core schema path.
export { users }

const PREFIX = pluginTablePrefix('email')
// `pl_email__`

const now = () => Date.now()

export const emailLog = sqliteTable(
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
    sentAt: integer('sent_at').notNull().$defaultFn(now),
  },
  (t) => ({
    byUserSent: index(`${PREFIX}log_user_sent_idx`).on(t.userId, t.sentAt),
    byMid: index(`${PREFIX}log_mid_idx`).on(t.providerMid),
    byTrigger: index(`${PREFIX}log_trigger_idx`).on(t.trigger, t.sentAt),
  }),
)

export const emailPreferences = sqliteTable(`${PREFIX}preferences`, {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: text('prefs').notNull(),
  tokenNonce: text('token_nonce').notNull(),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

export const emailSuppression = sqliteTable(
  `${PREFIX}suppression`,
  {
    email: text('email').primaryKey(),
    source: text('source', { enum: ['bounce', 'complaint', 'manual', 'unsubscribe'] }).notNull(),
    reason: text('reason'),
    addedAt: integer('added_at').notNull().$defaultFn(now),
  },
  (t) => ({ bySource: index(`${PREFIX}suppression_source_idx`).on(t.source) }),
)
