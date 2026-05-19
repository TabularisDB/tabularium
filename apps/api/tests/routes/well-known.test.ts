import { describe, it, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb } from '../helpers'
import { ensureSigningKey, rotateSigningKey } from '../../src/lib/registry-key'

describe('GET /.well-known/registry-key.json', () => {
  beforeEach(clearDb)

  it('returns a JWKS with the current key', async () => {
    await ensureSigningKey()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/.well-known/registry-key.json'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/jwk-set+json')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    const body = (await res.json()) as {
      keys: Array<{ kty: string; alg: string; crv: string; x: string; kid: string }>
    }
    expect(body.keys).toHaveLength(1)
    expect(body.keys[0].kty).toBe('OKP')
    expect(body.keys[0].alg).toBe('EdDSA')
    expect(body.keys[0].crv).toBe('Ed25519')
    expect(body.keys[0].x).toBeTruthy()
    expect(body.keys[0].kid).toHaveLength(16)
  })

  it('returns current + previous after rotation', async () => {
    await ensureSigningKey()
    await rotateSigningKey()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/.well-known/registry-key.json'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      keys: Array<{ kid: string }>
    }
    expect(body.keys).toHaveLength(2)
    // First key is the current (post-rotation), second is the previous.
    expect(body.keys[0].kid).not.toBe(body.keys[1].kid)
  })

  it('returns 503 when no key is configured yet', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/.well-known/registry-key.json'))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('signing key not configured')
  })
})
