import { Elysia } from 'elysia'
import { getCurrentPublicJwk, getPreviousPublicJwk } from '$lib/registry-key'

/**
 * JWKS handler factory. The exported default Elysia instance is mounted at
 * `/well-known/registry-key.json` by the file-router (it does not traverse
 * dot-prefixed directories like `.well-known`). An absolute-path alias at the
 * spec-correct URL `/.well-known/registry-key.json` is registered by
 * `routes/index.ts`, which sits at the router root and re-uses the handler
 * below via the named export.
 */
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
