// Discord-notifier plugin table — kernel-enforced prefix `pl_discord_notifier__`.
//
// The plugin owns one audit table — every webhook send (status, http status,
// error if any) lands here. The TS export name (`webhookLog`) stays neutral
// so call sites read clean; the DB table + index names get the prefix.

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { pluginTablePrefix } from '@tabularium/plugin-host-types'

const PREFIX = pluginTablePrefix('discord-notifier')
// `pl_discord_notifier__`

export const webhookLog = sqliteTable(
  `${PREFIX}webhook_log`,
  {
    id: text('id').primaryKey(),
    event: text('event').notNull(),
    status: text('status').notNull(),
    httpStatus: integer('http_status'),
    error: text('error'),
    sentAt: integer('sent_at').notNull(),
  },
  (t) => ({
    bySent: index(`${PREFIX}webhook_log_sent_idx`).on(t.sentAt),
    byEventSent: index(`${PREFIX}webhook_log_event_sent_idx`).on(t.event, t.sentAt),
  }),
)
