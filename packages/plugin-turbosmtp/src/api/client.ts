import { TurboSmtp, type Region } from 'turbosmtp'
import { host } from './host-handles'

/**
 * Build a TurboSMTP client straight from the live settings store.
 *
 * `mail.send()` requires consumer credentials and is reached through the
 * provider shim in `./provider`. The remaining endpoints (analytics, consumer
 * keys, billing) require API-key auth — the route handlers below talk to
 * those, so they only need `apiKey` populated.
 *
 * Returns `null` when the API key is missing. Callers translate that into a
 * 412 / "not configured yet" response.
 */
export function buildTurboClient(): TurboSmtp | null {
  const apiKey = host().settings.get('email.turbo.api_key')
  if (!apiKey) return null
  const consumerKey = host().settings.get('email.turbo.consumer_key')
  const consumerSecret = host().settings.get('email.turbo.consumer_secret')
  const region = host().settings.get('email.turbo.region') === 'eu' ? 'eu' : 'global'
  return new TurboSmtp({
    apiKey,
    consumer:
      consumerKey && consumerSecret ? { key: consumerKey, secret: consumerSecret } : undefined,
    region: region as Region,
  })
}
