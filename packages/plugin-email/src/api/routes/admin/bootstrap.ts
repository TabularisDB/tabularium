import { Elysia, t } from 'elysia'
import { TurboSmtp, type Region } from 'turbosmtp'
import { adminMiddleware } from '../../../../../../apps/api/src/middleware/admin'
import { recordAudit, actorFromAdmin } from '../../../../../../apps/api/src/lib/audit'
import { host } from '../../host-handles'

export type BootstrapDriver = {
  authorize(email: string, password: string, region: Region): Promise<{ auth: string }>
  listConsumerKeys(apiKey: string, region: Region): Promise<Array<{ label: string; consumer_key: string }>>
  deleteConsumerKey(apiKey: string, key: string, region: Region): Promise<{ ok: boolean }>
  createConsumerKey(apiKey: string, label: string, region: Region): Promise<{ consumer_key: string; consumer_secret: string }>
  sendTestMail(
    apiKey: string,
    consumerKey: string,
    consumerSecret: string,
    region: Region,
    to: string,
    from: string,
  ): Promise<{ mid: string }>
}

const realDriver: BootstrapDriver = {
  async authorize(email, password, region) {
    const c = new TurboSmtp({ region })
    const { auth } = await c.auth.authorize(email, password, true)
    return { auth }
  },
  async listConsumerKeys(apiKey, region) {
    const c = new TurboSmtp({ apiKey, region })
    const page = await c.consumerKeys.list()
    return page.results
      .filter((r): r is typeof r & { label: string; consumerKey: string } =>
        typeof r.label === 'string' && typeof r.consumerKey === 'string',
      )
      .map((r) => ({ label: r.label, consumer_key: r.consumerKey }))
  },
  async deleteConsumerKey(apiKey, key, region) {
    const c = new TurboSmtp({ apiKey, region })
    await c.consumerKeys.delete(key)
    return { ok: true }
  },
  async createConsumerKey(apiKey, label, region) {
    const c = new TurboSmtp({ apiKey, region })
    const created = await c.consumerKeys.create(label)
    return { consumer_key: created.consumerKey, consumer_secret: created.consumerSecret }
  },
  async sendTestMail(apiKey, consumerKey, consumerSecret, region, to, from) {
    const c = new TurboSmtp({ apiKey, consumer: { key: consumerKey, secret: consumerSecret }, region })
    const { mid } = await c.mail.send({
      from,
      to,
      subject: 'Tabularium email setup test',
      html_content: '<p>If you can read this, Tabularium emails are wired up.</p>',
      content: 'If you can read this, Tabularium emails are wired up.',
    })
    return { mid: String(mid) }
  },
}

let driverOverride: BootstrapDriver | null = null
export function __setBootstrapClientForTests(d: BootstrapDriver | null): void {
  driverOverride = d
}
function driver(): BootstrapDriver {
  return driverOverride ?? realDriver
}

const RESERVED_LABEL = 'tabularium'

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ body, admin, request, set }) => {
    const region: Region = body.region === 'eu' ? 'eu' : 'global'
    try {
      const { auth: apiKey } = await driver().authorize(body.email, body.password, region)

      const existing = await driver().listConsumerKeys(apiKey, region)
      const reserved = existing.find((k) => k.label === RESERVED_LABEL)
      if (reserved) await driver().deleteConsumerKey(apiKey, reserved.consumer_key, region)

      const created = await driver().createConsumerKey(apiKey, RESERVED_LABEL, region)

      await host().settings.set('email.provider', 'turbo')
      await host().settings.set('email.turbo.region', region)
      await host().settings.set('email.turbo.api_key', apiKey, { encrypted: true })
      await host().settings.set('email.turbo.consumer_key', created.consumer_key)
      await host().settings.set('email.turbo.consumer_secret', created.consumer_secret, { encrypted: true })

      const from = `"Tabularium" <${body.email}>`
      const { mid } = await driver().sendTestMail(apiKey, created.consumer_key, created.consumer_secret, region, body.email, from)

      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'email.bootstrap_success',
        target: 'settings:email',
        meta: { region, label: RESERVED_LABEL },
      })
      return { ok: true, consumerKeyLabel: RESERVED_LABEL, testMid: mid }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown'
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'email.bootstrap_failed',
        target: 'settings:email',
        meta: { region, reason },
      })
      set.status = 422
      return { error: reason }
    }
  },
  {
    detail: { tags: ['Admin'], summary: 'Bootstrap TurboSMTP from email + password', operationId: 'bootstrapTurboEmail' },
    body: t.Object({
      email: t.String({ minLength: 5, maxLength: 254 }),
      password: t.String({ minLength: 1, maxLength: 200 }),
      region: t.Optional(t.Union([t.Literal('global'), t.Literal('eu')])),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), consumerKeyLabel: t.String(), testMid: t.String() }),
      401: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
    },
  },
)
