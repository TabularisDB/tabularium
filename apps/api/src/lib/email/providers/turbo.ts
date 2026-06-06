import { TurboSmtp, type Region } from 'turbosmtp'
import { getSetting } from '../../settings'
import type { EmailMessage, EmailProvider, SendResult, VerifyResult } from '../types'

function getTurboRegion(): Region {
  const r = getSetting('email.turbo.region')
  return r === 'eu' ? 'eu' : 'global'
}

export async function buildTurboProvider(): Promise<EmailProvider | null> {
  const apiKey = getSetting('email.turbo.api_key')
  const consumerKey = getSetting('email.turbo.consumer_key')
  const consumerSecret = getSetting('email.turbo.consumer_secret')
  if (!apiKey || !consumerKey || !consumerSecret) return null

  const client = new TurboSmtp({
    apiKey,
    consumer: { key: consumerKey, secret: consumerSecret },
    region: getTurboRegion(),
  })

  return {
    name: 'turbo',
    async send(msg: EmailMessage): Promise<SendResult> {
      const { mid } = await client.mail.send({
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        html_content: msg.htmlContent,
        content: msg.textContent,
        custom_headers: msg.headers,
      })
      return { providerMid: typeof mid === 'string' ? mid : String(mid) }
    },
    async verifyAuth(): Promise<VerifyResult> {
      try {
        // listing one consumer key is the cheapest authenticated round-trip
        await client.consumerKeys.list()
        return { ok: true }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown'
        return { ok: false, reason }
      }
    },
  }
}
