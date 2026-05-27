import { describe, it, expect } from 'bun:test'
import { encryptToken, decryptToken } from '../../src/lib/crypto'

describe('crypto v1 AEAD', () => {
  it('roundtrips v1', () => {
    const out = decryptToken(encryptToken('hello-world'))
    expect(out).toBe('hello-world')
  })

  it('rejects ciphertext without the v1 version byte', () => {
    // Build a "raw layout" (legacy v0) ciphertext that the v1 decryptor must reject.
    const v1 = Buffer.from(encryptToken('payload'), 'base64')
    const legacy = v1.subarray(1)
    expect(() => decryptToken(legacy.toString('base64'))).toThrow(/format version|too short/i)
  })

  it('throws on truly corrupt ciphertext', () => {
    expect(() => decryptToken('AAAA')).toThrow()
  })
})
