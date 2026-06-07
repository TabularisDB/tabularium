import { TurboSmtp, type Region } from 'turbosmtp'
import type { PluginHost } from '@tabularium/plugin-host-types'
import type { EmailMessage, EmailProvider, SendResult, VerifyResult } from '@tabularium/plugin-email/types'

function getTurboRegion(host: PluginHost): Region {
  const r = host.settings.get('email.turbo.region')
  return r === 'eu' ? 'eu' : 'global'
}

/**
 * Build a TurboSMTP EmailProvider given a host handle. Settings are read
 * lazily inside send()/verifyAuth() so admin re-configuration takes effect
 * without re-registering.
 *
 * The legacy `buildTurboProvider()` factory (returns null when config
 * missing) is still useful for direct callers (e.g. the kept tests). For
 * the kernel registration path the result is an *always-resolvable* shim:
 * if config is missing send() throws and verifyAuth() returns ok:false.
 */
export async function buildTurboProvider(host: PluginHost): Promise<EmailProvider | null> {
  const apiKey = host.settings.get('email.turbo.api_key')
  const consumerKey = host.settings.get('email.turbo.consumer_key')
  const consumerSecret = host.settings.get('email.turbo.consumer_secret')
  if (!apiKey || !consumerKey || !consumerSecret) return null

  const client = new TurboSmtp({
    apiKey,
    consumer: { key: consumerKey, secret: consumerSecret },
    region: getTurboRegion(host),
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

/**
 * A lazy provider shim: registers under the kernel registry without needing
 * settings at register-time. Each call rebuilds the underlying client so
 * runtime setting changes apply.
 */
export function lazyTurboProvider(host: PluginHost): EmailProvider {
  return {
    name: 'turbo',
    async send(msg: EmailMessage): Promise<SendResult> {
      const inner = await buildTurboProvider(host)
      if (!inner) throw new Error('TurboSMTP not configured')
      return inner.send(msg)
    },
    async verifyAuth(): Promise<VerifyResult> {
      const inner = await buildTurboProvider(host)
      if (!inner) return { ok: false, reason: 'TurboSMTP not configured' }
      return inner.verifyAuth()
    },
  }
}
