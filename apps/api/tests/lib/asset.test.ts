import { describe, it, expect } from 'bun:test'
import { parseAssets, serializeAssets } from '../../src/lib/asset'

describe('parseAssets', () => {
  it('returns empty object for non-JSON input', () => {
    expect(parseAssets('garbage')).toEqual({})
    expect(parseAssets('')).toEqual({})
    expect(parseAssets('null')).toEqual({})
  })

  it('converts legacy string-shape assets to rich entries', () => {
    const legacy = JSON.stringify({
      'linux-x64': 'https://example.com/linux.zip',
      'darwin-arm64': 'https://example.com/darwin.zip',
    })
    expect(parseAssets(legacy)).toEqual({
      'linux-x64': { url: 'https://example.com/linux.zip' },
      'darwin-arm64': { url: 'https://example.com/darwin.zip' },
    })
  })

  it('preserves rich entries with sha256 + size', () => {
    const rich = JSON.stringify({
      'linux-x64': { url: 'https://example.com/linux.zip', sha256: 'abc', size: 1024 },
    })
    expect(parseAssets(rich)).toEqual({
      'linux-x64': { url: 'https://example.com/linux.zip', sha256: 'abc', size: 1024 },
    })
  })

  it('drops entries without a url string', () => {
    const broken = JSON.stringify({
      good: { url: 'https://x' },
      bad: { foo: 'bar' },
      worse: 42,
    })
    expect(parseAssets(broken)).toEqual({ good: { url: 'https://x' } })
  })

  it('round-trips through serializeAssets', () => {
    const input = { 'linux-x64': { url: 'https://e/x.zip', sha256: 'aa', size: 10 } }
    expect(parseAssets(serializeAssets(input))).toEqual(input)
  })
})
