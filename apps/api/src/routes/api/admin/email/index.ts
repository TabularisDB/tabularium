import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getSetting, hasSetting, setSetting, deleteSetting } from '$lib/settings'

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
  const raw = getSetting('email.from.overrides')
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

export default new Elysia().use(adminMiddleware).get(
  '/',
  () => {
    const provider = (getSetting('email.provider') as 'turbo' | 'smtp' | undefined) ?? null
    const portRaw = getSetting('email.smtp.port')
    return {
      provider,
      from: {
        default: getSetting('email.from.default') ?? '',
        overrides: parseOverrides(),
      },
      turbo: {
        apiKeySet: hasSetting('email.turbo.api_key'),
        consumerKey: getSetting('email.turbo.consumer_key') ?? null,
        consumerSecretSet: hasSetting('email.turbo.consumer_secret'),
        region: (getSetting('email.turbo.region') as 'global' | 'eu') ?? 'global',
      },
      smtp: {
        host: getSetting('email.smtp.host') ?? null,
        port: portRaw ? Number(portRaw) : null,
        user: getSetting('email.smtp.user') ?? null,
        passSet: hasSetting('email.smtp.pass'),
        tls: getSetting('email.smtp.tls') !== 'false',
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
      if (body.provider) await setSetting('email.provider', body.provider)
      else await deleteSetting('email.provider')

      await setSetting('email.from.default', body.from.default)
      await setSetting('email.from.overrides', JSON.stringify(body.from.overrides))

      if (body.turbo) {
        if (body.turbo.apiKey !== undefined) await setSetting('email.turbo.api_key', body.turbo.apiKey, { encrypted: true })
        if (body.turbo.consumerKey !== undefined) await setSetting('email.turbo.consumer_key', body.turbo.consumerKey)
        if (body.turbo.consumerSecret !== undefined) await setSetting('email.turbo.consumer_secret', body.turbo.consumerSecret, { encrypted: true })
        if (body.turbo.region !== undefined) await setSetting('email.turbo.region', body.turbo.region)
      }

      if (body.smtp) {
        if (body.smtp.host !== undefined) await setSetting('email.smtp.host', body.smtp.host)
        if (body.smtp.port !== undefined) await setSetting('email.smtp.port', String(body.smtp.port))
        if (body.smtp.user !== undefined) await setSetting('email.smtp.user', body.smtp.user)
        if (body.smtp.pass !== undefined) await setSetting('email.smtp.pass', body.smtp.pass, { encrypted: true })
        if (body.smtp.tls !== undefined) await setSetting('email.smtp.tls', body.smtp.tls ? 'true' : 'false')
      }
      return { ok: true }
    },
    {
      detail: { tags: ['Admin'], summary: 'Write email provider settings', operationId: 'putEmailSettings' },
      body: putBodySchema,
      response: { 200: t.Object({ ok: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    },
  )
