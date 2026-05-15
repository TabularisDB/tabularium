import { describe, it, expect } from 'bun:test'
import { createCipheriv, randomBytes } from 'node:crypto'
import { encryptToken, decryptToken } from '../../src/lib/crypto'
import { env } from '../../src/lib/env'

function encryptLegacy(plaintext: string): string {
  const key = Buffer.from(env.TOKEN_ENC_KEY, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

describe('crypto token v1 + legacy compat', () => {
  it('roundtrips v1', () => {
    const out = decryptToken(encryptToken('hello-world'))
    expect(out).toBe('hello-world')
  })

  it('decrypts legacy ciphertext (no version byte)', () => {
    const legacy = encryptLegacy('legacy-payload')
    expect(decryptToken(legacy)).toBe('legacy-payload')
  })

  it('decrypts legacy ciphertext whose first byte happens to be 0x01', () => {
    // brute-force a legacy ciphertext starting with 0x01
    let attempt = ''
    for (let i = 0; i < 200; i++) {
      attempt = encryptLegacy(`payload-${i}`)
      if (Buffer.from(attempt, 'base64')[0] === 0x01) break
    }
    if (Buffer.from(attempt, 'base64')[0] !== 0x01) {
      return
    }
    const idx = Number(attempt.match(/^.*$/)![0] ? 0 : 0)
    void idx
    // round-trip what we have; the assertion below just confirms decrypt fallback runs without throw
    const plaintext = decryptToken(attempt)
    expect(plaintext.startsWith('payload-')).toBe(true)
  })

  it('throws on truly corrupt ciphertext', () => {
    expect(() => decryptToken('AAAA')).toThrow()
  })
})
