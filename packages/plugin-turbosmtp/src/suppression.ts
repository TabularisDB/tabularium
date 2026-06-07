import { TurboSmtp, type Region } from 'turbosmtp'
import type { PluginHost } from '@tabularium/plugin-host-types'
import type { SuppressionSource, SuppressionRow } from '@tabularium/plugin-email/types'

function turboRegion(host: PluginHost): Region {
  return host.settings.get('email.turbo.region') === 'eu' ? 'eu' : 'global'
}

function getClient(host: PluginHost): TurboSmtp | null {
  if (host.settings.get('email.provider') !== 'turbo') return null
  const apiKey = host.settings.get('email.turbo.api_key')
  if (!apiKey) return null
  return new TurboSmtp({ apiKey, region: turboRegion(host) })
}

/**
 * Build the SuppressionSource impl for TurboSMTP. The client is rebuilt on
 * every call so admin-side reconfiguration takes effect without re-registering.
 *
 * `isActive()` short-circuits all three methods when the provider isn't set
 * to "turbo" or the api key is missing — callers use it to skip the source
 * entirely instead of catching errors.
 */
export function buildTurboSuppressionSource(host: PluginHost): SuppressionSource {
  return {
    isActive() {
      return getClient(host) !== null
    },
    async list(fromDate, toDate) {
      const client = getClient(host)
      if (!client) return []
      const page = await client.suppressions.list({ from: fromDate, to: toDate, limit: 500 })
      const out: Array<SuppressionRow> = []
      // turbosmtp-ts returns a Page<T> exposing .results; tail of the list will
      // be caught on the next 15-minute tick if it exceeds limit=500.
      const rows =
        (page as { results?: Array<{ recipient?: string | null; source?: string | null; reason?: string | null }> })
          .results ?? []
      for (const r of rows) {
        if (!r.recipient) continue
        out.push({ email: r.recipient.toLowerCase(), source: r.source ?? 'bounce', reason: r.reason ?? null })
      }
      return out
    },
    async add(email, reason) {
      const client = getClient(host)
      if (!client) return
      await client.suppressions.import({
        type: 'manual',
        reason: reason ?? undefined,
        content: [email],
      })
    },
    async remove(email) {
      const client = getClient(host)
      if (!client) return
      await client.suppressions.bulkDelete([email])
    },
  }
}
