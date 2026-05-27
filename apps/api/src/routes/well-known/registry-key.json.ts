import { Elysia } from 'elysia'
import { getCurrentPublicJwk, getPreviousPublicJwk } from '$lib/registry-key'

// Exported separately so routes/index.ts can alias this at the spec-correct
// `/.well-known/...` URL (the file-router can't discover dot-prefixed dirs).
export async function handleJwks(set: {
  status?: number | string
  headers: Record<string, string | number>
}): Promise<{ keys: unknown[] } | { error: string }> {
  const current = await getCurrentPublicJwk().catch(() => null)
  if (!current) {
    set.status = 503
    return { error: 'signing key not configured' }
  }
  const previous = await getPreviousPublicJwk().catch(() => null)
  set.headers['content-type'] = 'application/jwk-set+json'
  set.headers['cache-control'] = 'public, max-age=300'
  return { keys: previous ? [current, previous] : [current] }
}

export default new Elysia().get('/', async ({ set }) => handleJwks(set), {
  detail: {
    tags: ['Plugins'],
    summary: 'JWKS for registry release signatures',
    operationId: 'getRegistryJwks',
  },
})
