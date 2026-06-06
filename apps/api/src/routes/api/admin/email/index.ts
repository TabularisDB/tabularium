import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getSetting, hasSetting } from '$lib/settings'

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
