import { treaty } from '@elysiajs/eden'
import type { App } from '@tabularium/api'

export type { App }

// The treaty proxy is intentionally typed loosely. The `App` type sourced from
// `@tabularium/api` is a hand-shaped placeholder (see `apps/api/src/types.ts`):
// the runtime app uses elysia-fsr with `types: false`, so its routes
// aren't statically inferred and Eden Treaty cannot derive a meaningful proxy
// shape. Consumers navigate the proxy by string path; the server enforces the
// schema at request time.
//
// Without this cast, svelte-check across the workspace produces ~100 cascading
// errors on every property access. The runtime behavior is unchanged.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Client = any

export function createClient(baseUrl: string): Client {
  return treaty<App>(baseUrl, { fetch: { credentials: 'include' } })
}
