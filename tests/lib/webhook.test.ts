import { describe, it, expect } from 'bun:test'
import { verifyWebhookSignature, inferPlatformKey } from '../../src/lib/webhook'

describe('inferPlatformKey', () => {
  it.each([
    ['duckdb-plugin-linux-x64.zip', 'linux-x64'],
    ['duckdb-plugin-linux-amd64.zip', 'linux-x64'],
    ['plugin-linux-arm64.zip', 'linux-arm64'],
    ['plugin-darwin-arm64.zip', 'darwin-arm64'],
    ['plugin-macos-arm64.zip', 'darwin-arm64'],
    ['plugin-darwin-x64.zip', 'darwin-x64'],
    ['plugin-macos-amd64.zip', 'darwin-x64'],
    ['plugin-win-x64.zip', 'win-x64'],
    ['plugin-windows-x64.zip', 'win-x64'],
    ['plugin-windows-amd64.zip', 'win-x64'],
    ['plugin-universal.zip', 'universal'],
  ])('%s → %s', (filename, expected) => {
    expect(inferPlatformKey(filename)).toBe(expected)
  })
  it('returns null for unrecognized filename', () => {
    expect(inferPlatformKey('plugin-riscv.zip')).toBeNull()
  })
})

describe('verifyWebhookSignature', () => {
  it('returns true for a valid HMAC', async () => {
    const secret = 'my-secret'
    const body = Buffer.from('{"action":"published"}')
    const hasher = new Bun.CryptoHasher('sha256', secret)
    hasher.update(body)
    const sig = 'sha256=' + hasher.digest('hex')
    expect(await verifyWebhookSignature(secret, body, sig)).toBe(true)
  })
  it('returns false for wrong secret', async () => {
    const body = Buffer.from('{"action":"published"}')
    const hasher = new Bun.CryptoHasher('sha256', 'correct-secret')
    hasher.update(body)
    const sig = 'sha256=' + hasher.digest('hex')
    expect(await verifyWebhookSignature('wrong-secret', body, sig)).toBe(false)
  })
  it('returns false for tampered body', async () => {
    const secret = 'my-secret'
    const hasher = new Bun.CryptoHasher('sha256', secret)
    hasher.update(Buffer.from('original'))
    const sig = 'sha256=' + hasher.digest('hex')
    expect(await verifyWebhookSignature(secret, Buffer.from('tampered'), sig)).toBe(false)
  })
})
