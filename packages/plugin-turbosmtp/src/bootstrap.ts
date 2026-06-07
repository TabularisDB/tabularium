import { TurboSmtp, type Region } from 'turbosmtp'
import type { BootstrapDriver, BootstrapRegion } from '@tabularium/plugin-email/types'

/**
 * Build the BootstrapDriver impl that drives the admin's "set me up from
 * email + password" flow against TurboSMTP's REST API. The driver is the
 * only place this plugin talks to `TurboSmtp.auth.authorize` /
 * `consumerKeys.{list,delete,create}` / `mail.send`.
 */
export function buildTurboBootstrap(): BootstrapDriver {
  const toRegion = (r: BootstrapRegion): Region => (r === 'eu' ? 'eu' : 'global')
  return {
    async authorize(email, password, region) {
      const c = new TurboSmtp({ region: toRegion(region) })
      const { auth } = await c.auth.authorize(email, password, true)
      return { auth }
    },
    async listConsumerKeys(apiKey, region) {
      const c = new TurboSmtp({ apiKey, region: toRegion(region) })
      const page = await c.consumerKeys.list()
      return page.results
        .filter(
          (r): r is typeof r & { label: string; consumerKey: string } =>
            typeof r.label === 'string' && typeof r.consumerKey === 'string',
        )
        .map((r) => ({ label: r.label, consumer_key: r.consumerKey }))
    },
    async deleteConsumerKey(apiKey, key, region) {
      const c = new TurboSmtp({ apiKey, region: toRegion(region) })
      await c.consumerKeys.delete(key)
      return { ok: true }
    },
    async createConsumerKey(apiKey, label, region) {
      const c = new TurboSmtp({ apiKey, region: toRegion(region) })
      const created = await c.consumerKeys.create(label)
      return { consumer_key: created.consumerKey, consumer_secret: created.consumerSecret }
    },
    async sendTestMail(apiKey, consumerKey, consumerSecret, region, to, from) {
      const c = new TurboSmtp({
        apiKey,
        consumer: { key: consumerKey, secret: consumerSecret },
        region: toRegion(region),
      })
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
}
