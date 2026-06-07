import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'
import { setHost } from './host-handles'
import { buildRoutes } from './routes'
import { sendDiscordWebhook } from './webhook'

export const meta: PluginMeta = {
  id: 'discord-notifier',
  version: '1.0.0',
  contributions: {
    'admin-nav-entry': [
      {
        id: 'discord-notifier',
        href: '/admin/discord-notifier',
        labelKey: 'admin_nav_discord_notifier',
        icon: 'bell',
        order: 78,
      },
    ],
    'admin-page-route': [
      {
        path: '/admin/discord-notifier',
        componentImport: '@tabularium/plugin-discord-notifier/frontend/admin/Settings.svelte',
      },
    ],
  },
}

export async function register(host: PluginHost): Promise<void> {
  setHost(host)
  host.mountRoutes(buildRoutes())

  // Subscribe to the three lifecycle events we relay. The kernel runs each
  // handler via queueMicrotask, so emit-sites stay fire-and-forget. We catch
  // inside the handlers as well so a misconfigured webhook can't poison the
  // bus or cascade-fail other subscribers (e.g. the email plugin).
  host.events.on('account.welcome', async ({ username }) => {
    try {
      await sendDiscordWebhook(
        { content: `:wave: New signup: **${escapeMarkdown(username)}**` },
        'account.welcome',
      )
    } catch (err) {
      host.logger.error('account.welcome webhook dispatch failed', { err: String(err) })
    }
  })

  host.events.on('plugin.approved', async ({ pluginName, actor }) => {
    try {
      await sendDiscordWebhook(
        {
          content: `:white_check_mark: Plugin approved: **${escapeMarkdown(pluginName)}** by ${escapeMarkdown(
            actor.name,
          )}`,
        },
        'plugin.approved',
      )
    } catch (err) {
      host.logger.error('plugin.approved webhook dispatch failed', { err: String(err) })
    }
  })

  host.events.on('plugin.rejected', async ({ pluginName, reason, actor }) => {
    try {
      await sendDiscordWebhook(
        {
          content: `:x: Plugin rejected: **${escapeMarkdown(pluginName)}** by ${escapeMarkdown(
            actor.name,
          )}\n> ${escapeMarkdown(reason)}`,
        },
        'plugin.rejected',
      )
    } catch (err) {
      host.logger.error('plugin.rejected webhook dispatch failed', { err: String(err) })
    }
  })
}

/**
 * Escape Discord markdown control characters in user-supplied strings so an
 * actor named `**Boss**` doesn't bold-format their own line, etc. Lightweight
 * — we only neutralize the characters Discord uses for formatting; the rest
 * of the payload is plumber's plain text.
 */
function escapeMarkdown(s: string): string {
  return s.replace(/[\\`*_~|>]/g, (m) => `\\${m}`)
}

// Re-exports so apps/api and tests can pick up the plugin surface in one go.
export { sendDiscordWebhook, DEFAULT_ENABLED_EVENTS } from './webhook'
export type { DiscordWebhookPayload, SendOutcome, SendStatus } from './webhook'
export { __resetHostForTests } from './host-handles'
