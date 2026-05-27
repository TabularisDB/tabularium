import { Elysia } from 'elysia'
import { handleJwks } from './well-known/registry-key.json'

// Bun.Glob skips dot-prefixed dirs, so the file-router never finds
// `.well-known/...`. Register the spec-correct URL here instead, reusing the
// handler from the discoverable `/well-known/registry-key.json` route.
export default new Elysia().get('/.well-known/registry-key.json', async ({ set }) => handleJwks(set), {
  detail: {
    tags: ['Plugins'],
    summary: 'JWKS for registry release signatures',
    operationId: 'getRegistryJwksWellKnown',
  },
})
