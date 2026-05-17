import { describe, it, expect } from 'bun:test'
import { verifyAssetHash, verifyRegistrySignature } from '../src/index'

describe('verifyAssetHash', () => {
  it('returns ok=true when stream sha256 matches expected', async () => {
    const body = new TextEncoder().encode('hello world')
    const sha = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(body); c.close() } })
    const result = await verifyAssetHash(stream, sha)
    expect(result.ok).toBe(true)
    expect(result.size).toBe(body.byteLength)
  })

  it('returns ok=false on mismatch', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([0])); c.close() } })
    const result = await verifyAssetHash(stream, '0'.repeat(64))
    expect(result.ok).toBe(false)
  })
})

describe('verifyRegistrySignature', () => {
  // RFC 8032 §7.1 TEST 1 vector — message is empty.
  const PUBLIC_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'
  const SIG_HEX = 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'

  it('verifies an Ed25519 signature using the public key + canonical bytes', async () => {
    const publicJwk = { kty: 'OKP', crv: 'Ed25519', x: hexToB64u(PUBLIC_HEX) }
    const payload = new Uint8Array(0)
    const sig = hexToBytes(SIG_HEX)
    const ok = await verifyRegistrySignature({ payloadBytes: payload, signature: sig, publicKeyJwk: publicJwk })
    expect(ok).toBe(true)
  })

  // Helpers — inline to avoid extra fixtures.
  function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
    return out
  }
  function hexToB64u(hex: string): string {
    const bytes = hexToBytes(hex)
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
})
