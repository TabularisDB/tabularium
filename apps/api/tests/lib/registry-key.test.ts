import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import {
  ensureSigningKey,
  getCurrentPublicJwk,
  rotateSigningKey,
  signPayload,
} from '../../src/lib/registry-key'
import { getSetting } from '../../src/lib/settings'

describe('registry signing key', () => {
  beforeEach(clearDb)

  it('lazy-generates the keypair on first call', async () => {
    expect(getSetting('registry.signing_key.public')).toBeUndefined()
    await ensureSigningKey()
    expect(getSetting('registry.signing_key.public')).toBeTruthy()
    expect(getSetting('registry.signing_key.private')).toBeTruthy()
    expect(getSetting('registry.signing_key.kid')).toHaveLength(16)
  })

  it('does not regenerate if a key already exists', async () => {
    await ensureSigningKey()
    const kid1 = getSetting('registry.signing_key.kid')
    await ensureSigningKey()
    expect(getSetting('registry.signing_key.kid')).toBe(kid1)
  })

  it('encrypts the private key at rest (TOKEN_ENC_KEY envelope)', async () => {
    await ensureSigningKey()
    const rows = await (await import('../../src/db')).db
      .select()
      .from((await import('../../src/db/schema')).settings)
    const priv = rows.find((r) => r.key === 'registry.signing_key.private')!
    expect(priv.encrypted).toBe(1)
  })

  it('rotateSigningKey moves the old key to .previous and assigns a new kid', async () => {
    await ensureSigningKey()
    const oldKid = getSetting('registry.signing_key.kid')!
    await rotateSigningKey()
    expect(getSetting('registry.signing_key.kid')).not.toBe(oldKid)
    expect(getSetting('registry.signing_key.previous.kid')).toBe(oldKid)
  })

  it('signPayload returns a JWS compact-form string verifiable against the current public JWK', async () => {
    await ensureSigningKey()
    const jws = await signPayload({ v: 1, foo: 'bar' })
    expect(jws.split('.')).toHaveLength(3)
    const { compactVerify, importJWK } = await import('jose')
    const jwk = await getCurrentPublicJwk()
    const key = await importJWK(jwk as any, 'EdDSA')
    const { payload } = await compactVerify(jws, key)
    const data = JSON.parse(new TextDecoder().decode(payload)) as { foo: string }
    expect(data.foo).toBe('bar')
  })
})
