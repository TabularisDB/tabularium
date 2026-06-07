import { TurboSmtp, type Region } from 'turbosmtp'
import { getSetting } from '$lib/settings'

export type UpstreamDriver = {
  add(email: string, reason: string | null): Promise<void>
  remove(email: string): Promise<void>
}

let driverOverride: UpstreamDriver | null = null
export function __setUpstreamDriverForTests(d: UpstreamDriver | null): void {
  driverOverride = d
}

function getTurboRegion(): Region {
  return getSetting('email.turbo.region') === 'eu' ? 'eu' : 'global'
}

export function getUpstreamDriver(): UpstreamDriver | null {
  if (driverOverride) return driverOverride
  if (getSetting('email.provider') !== 'turbo') return null
  const apiKey = getSetting('email.turbo.api_key')
  if (!apiKey) return null
  const client = new TurboSmtp({ apiKey, region: getTurboRegion() })
  return {
    async add(email, reason) {
      await client.suppressions.import({ type: 'manual', reason: reason ?? undefined, content: [email] })
    },
    async remove(email) {
      await client.suppressions.bulkDelete([email])
    },
  }
}
