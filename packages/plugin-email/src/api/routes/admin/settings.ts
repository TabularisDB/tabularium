import { Elysia, t } from 'elysia'
import { host } from '../../host-handles'
import { restartSuppressionSync } from '../../suppression-sync'

const fromSchema = t.Object({
  default: t.String(),
  overrides: t.Record(t.String(), t.String()),
})

const turboSchema = t.Object({
  apiKeySet: t.Boolean(),
  consumerKey: t.Nullable(t.String()),
  consumerSecretSet: t.Boolean(),
  region: t.Union([t.Literal('global'), t.Literal('eu')]),
})

const smtpSchema = t.Object({
  host: t.Nullable(t.String()),
  port: t.Nullable(t.Number()),
  user: t.Nullable(t.String()),
  passSet: t.Boolean(),
  tls: t.Boolean(),
})

const settingsViewSchema = t.Object({
  provider: t.Nullable(t.Union([t.Literal('turbo'), t.Literal('smtp')])),
  from: fromSchema,
  turbo: turboSchema,
  smtp: smtpSchema,
})

const putBodySchema = t.Object({
  provider: t.Nullable(t.Union([t.Literal('turbo'), t.Literal('smtp')])),
  from: t.Object({
    default: t.String(),
    overrides: t.Record(t.String(), t.String()),
  }),
  turbo: t.Optional(
    t.Object({
      apiKey: t.Optional(t.String()),
      consumerKey: t.Optional(t.String()),
      consumerSecret: t.Optional(t.String()),
      region: t.Optional(t.Union([t.Literal('global'), t.Literal('eu')])),
    }),
  ),
  smtp: t.Optional(
    t.Object({
      host: t.Optional(t.String()),
      port: t.Optional(t.Number()),
      user: t.Optional(t.String()),
      pass: t.Optional(t.String()),
      tls: t.Optional(t.Boolean()),
    }),
  ),
})

function parseOverrides(): Record<string, string> {
  const raw = host().settings.get('email.from.overrides')
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function syncActiveProvider(): void {
  const kind = host().settings.get('email.provider')
  if (kind !== 'turbo' && kind !== 'smtp') return
  const name = kind === 'turbo' ? 'turbosmtp' : 'smtp'
  try {
    host().registry.setActive('email-provider', name)
  } catch {
    // provider plugin not loaded — no-op
  }
}

export default function buildSettingsRoute() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Elysia().use(host().middleware.admin as any).get(
    '/',
    () => {
      const provider = (host().settings.get('email.provider') as 'turbo' | 'smtp' | undefined) ?? null
      const portRaw = host().settings.get('email.smtp.port')
      return {
        provider,
        from: {
          default: host().settings.get('email.from.default') ?? '',
          overrides: parseOverrides(),
        },
        turbo: {
          apiKeySet: host().settings.has('email.turbo.api_key'),
          consumerKey: host().settings.get('email.turbo.consumer_key') ?? null,
          consumerSecretSet: host().settings.has('email.turbo.consumer_secret'),
          region: (host().settings.get('email.turbo.region') as 'global' | 'eu') ?? 'global',
        },
        smtp: {
          host: host().settings.get('email.smtp.host') ?? null,
          port: portRaw ? Number(portRaw) : null,
          user: host().settings.get('email.smtp.user') ?? null,
          passSet: host().settings.has('email.smtp.pass'),
          tls: host().settings.get('email.smtp.tls') !== 'false',
        },
      }
    },
    {
      detail: { tags: ['Admin'], summary: 'Read email provider settings (secrets masked)', operationId: 'getEmailSettings' },
      response: { 200: settingsViewSchema, 401: t.Object({ error: t.String() }) },
    },
  )
    .put(
      '/',
      async ({ body }) => {
        if (body.provider) await host().settings.set('email.provider', body.provider)
        else await host().settings.delete('email.provider')

        await host().settings.set('email.from.default', body.from.default)
        await host().settings.set('email.from.overrides', JSON.stringify(body.from.overrides))

        if (body.turbo) {
          if (body.turbo.apiKey !== undefined) await host().settings.set('email.turbo.api_key', body.turbo.apiKey, { encrypted: true })
          if (body.turbo.consumerKey !== undefined) await host().settings.set('email.turbo.consumer_key', body.turbo.consumerKey)
          if (body.turbo.consumerSecret !== undefined) await host().settings.set('email.turbo.consumer_secret', body.turbo.consumerSecret, { encrypted: true })
          if (body.turbo.region !== undefined) await host().settings.set('email.turbo.region', body.turbo.region)
        }

        if (body.smtp) {
          if (body.smtp.host !== undefined) await host().settings.set('email.smtp.host', body.smtp.host)
          if (body.smtp.port !== undefined) await host().settings.set('email.smtp.port', String(body.smtp.port))
          if (body.smtp.user !== undefined) await host().settings.set('email.smtp.user', body.smtp.user)
          if (body.smtp.pass !== undefined) await host().settings.set('email.smtp.pass', body.smtp.pass, { encrypted: true })
          if (body.smtp.tls !== undefined) await host().settings.set('email.smtp.tls', body.smtp.tls ? 'true' : 'false')
        }
        syncActiveProvider()
        restartSuppressionSync()
        return { ok: true }
      },
      {
        detail: { tags: ['Admin'], summary: 'Write email provider settings', operationId: 'putEmailSettings' },
        body: putBodySchema,
        response: { 200: t.Object({ ok: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
      },
    )
}
