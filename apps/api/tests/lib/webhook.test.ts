import { describe, it, expect } from 'bun:test'
import { verifyGithubSignature, inferPlatformKey } from '../../src/lib/webhook'

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

const VALID_SECRET = 'a'.repeat(40)
const OTHER_SECRET = 'b'.repeat(40)

describe('verifyGithubSignature', () => {
  it('returns true for a valid HMAC', async () => {
    const body = Buffer.from('{"action":"published"}')
    const hasher = new Bun.CryptoHasher('sha256', VALID_SECRET)
    hasher.update(body)
    const sig = 'sha256=' + hasher.digest('hex')
    expect(await verifyGithubSignature(VALID_SECRET, body, sig)).toBe(true)
  })
  it('returns false for wrong secret', async () => {
    const body = Buffer.from('{"action":"published"}')
    const hasher = new Bun.CryptoHasher('sha256', VALID_SECRET)
    hasher.update(body)
    const sig = 'sha256=' + hasher.digest('hex')
    expect(await verifyGithubSignature(OTHER_SECRET, body, sig)).toBe(false)
  })
  it('returns false for tampered body', async () => {
    const hasher = new Bun.CryptoHasher('sha256', VALID_SECRET)
    hasher.update(Buffer.from('original'))
    const sig = 'sha256=' + hasher.digest('hex')
    expect(await verifyGithubSignature(VALID_SECRET, Buffer.from('tampered'), sig)).toBe(false)
  })
  it('rejects empty secret even with matching empty signature', async () => {
    expect(await verifyGithubSignature('', Buffer.from('x'), 'sha256=')).toBe(false)
  })
  it('rejects secrets shorter than 32 chars', async () => {
    const shortSecret = 'short'
    const hasher = new Bun.CryptoHasher('sha256', shortSecret)
    hasher.update(Buffer.from('x'))
    const sig = 'sha256=' + hasher.digest('hex')
    expect(await verifyGithubSignature(shortSecret, Buffer.from('x'), sig)).toBe(false)
  })
})
