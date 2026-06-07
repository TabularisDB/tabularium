import { Elysia, t } from 'elysia'
import { host } from '../host-handles'
import { DEFAULT_ENABLED_EVENTS } from '../webhook'

const settingsViewSchema = t.Object({
  webhookUrlSet: t.Boolean(),
  username: t.Nullable(t.String()),
  enabledEvents: t.Array(t.String()),
})

const putBodySchema = t.Object({
  webhookUrl: t.Optional(t.String()),
  username: t.Optional(t.Nullable(t.String())),
  enabledEvents: t.Optional(t.Array(t.String())),
})

function readEnabledEvents(): string[] {
  const raw = host().settings.get('discord-notifier.enabled_events')
  if (!raw) return [...DEFAULT_ENABLED_EVENTS]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed
  } catch {
    // fall through
  }
  return [...DEFAULT_ENABLED_EVENTS]
}

export default function buildSettingsRoute() {
  return (
    new Elysia()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(host().middleware.admin as any)
      .get(
        '/',
        () => {
          return {
            webhookUrlSet: host().settings.has('discord-notifier.webhook_url'),
            username: host().settings.get('discord-notifier.username') ?? null,
            enabledEvents: readEnabledEvents(),
          }
        },
        {
          detail: {
            tags: ['Admin'],
            summary: 'Read Discord-notifier settings (webhook URL masked)',
            operationId: 'getDiscordNotifierSettings',
          },
          response: { 200: settingsViewSchema, 401: t.Object({ error: t.String() }) },
        },
      )
      .put(
        '/',
        async ({ body }) => {
          if (body.webhookUrl !== undefined) {
            if (body.webhookUrl === '') {
              await host().settings.delete('discord-notifier.webhook_url')
            } else {
              await host().settings.set('discord-notifier.webhook_url', body.webhookUrl, {
                encrypted: true,
              })
            }
          }
          if (body.username !== undefined) {
            if (body.username === null || body.username === '') {
              await host().settings.delete('discord-notifier.username')
            } else {
              await host().settings.set('discord-notifier.username', body.username)
            }
          }
          if (body.enabledEvents !== undefined) {
            await host().settings.set(
              'discord-notifier.enabled_events',
              JSON.stringify(body.enabledEvents),
            )
          }
          return { ok: true }
        },
        {
          detail: {
            tags: ['Admin'],
            summary: 'Write Discord-notifier settings',
            operationId: 'putDiscordNotifierSettings',
          },
          body: putBodySchema,
          response: {
            200: t.Object({ ok: t.Boolean() }),
            400: t.Object({ error: t.String() }),
            401: t.Object({ error: t.String() }),
          },
        },
      )
  )
}
