// Postgres mirror of schema.ts — see that file for the table-prefix rationale.
import { pgTable, text, integer, bigint, index } from 'drizzle-orm/pg-core'
import { pluginTablePrefix } from '@tabularium/plugin-host-types'

const PREFIX = pluginTablePrefix('discord-notifier')
// `pl_discord_notifier__`

const ts = (name: string) => bigint(name, { mode: 'number' })

export const webhookLog = pgTable(
  `${PREFIX}webhook_log`,
  {
    id: text('id').primaryKey(),
    event: text('event').notNull(),
    status: text('status').notNull(),
    httpStatus: integer('http_status'),
    error: text('error'),
    sentAt: ts('sent_at').notNull(),
  },
  (t) => ({
    bySent: index(`${PREFIX}webhook_log_sent_idx`).on(t.sentAt),
    byEventSent: index(`${PREFIX}webhook_log_event_sent_idx`).on(t.event, t.sentAt),
  }),
)
