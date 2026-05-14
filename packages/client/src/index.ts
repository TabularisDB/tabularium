import { treaty } from '@elysiajs/eden'
import type { App } from '@tabularium/api'

export type { App }

export function createClient(baseUrl: string) {
  return treaty<App>(baseUrl, { fetch: { credentials: 'include' } })
}
