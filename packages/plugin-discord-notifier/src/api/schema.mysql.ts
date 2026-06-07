// MySQL mirror of schema.ts — see that file for the table-prefix rationale.
import { mysqlTable, text, varchar, int, bigint, index } from 'drizzle-orm/mysql-core'
import { pluginTablePrefix } from '@tabularium/plugin-host-types'

const PREFIX = pluginTablePrefix('discord-notifier')
// `pl_discord_notifier__`

const ts = (name: string) => bigint(name, { mode: 'number' })
const id = (name: string) => varchar(name, { length: 64 })

export const webhookLog = mysqlTable(
  `${PREFIX}webhook_log`,
  {
    id: id('id').primaryKey(),
    event: varchar('event', { length: 80 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    httpStatus: int('http_status'),
    error: text('error'),
    sentAt: ts('sent_at').notNull(),
  },
  (t) => ({
    bySent: index(`${PREFIX}webhook_log_sent_idx`).on(t.sentAt),
    byEventSent: index(`${PREFIX}webhook_log_event_sent_idx`).on(t.event, t.sentAt),
  }),
)
