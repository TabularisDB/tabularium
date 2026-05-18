import { Elysia } from 'elysia'
import { handleJwks } from './well-known/registry-key.json'

/**
 * Root-level route file. The file-router treats `index.ts` specially and mounts
 * it without a path prefix, which is the only way to register absolute paths
 * starting with `/.well-known/...` (the file-router's underlying Bun.Glob does
 * not descend into dot-prefixed directories like `.well-known/`).
 *
 * We re-use the JWKS handler from `well-known/registry-key.json.ts` so the same
 * response is served at both the spec-correct `/.well-known/registry-key.json`
 * and the file-router-discoverable `/well-known/registry-key.json`.
 */
export default new Elysia().get('/.well-known/registry-key.json', async ({ set }) => handleJwks(set), {
  detail: {
    tags: ['Plugins'],
    summary: 'JWKS for registry release signatures',
    operationId: 'getRegistryJwksWellKnown',
  },
})
