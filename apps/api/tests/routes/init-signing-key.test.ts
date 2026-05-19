import { describe, it, expect, beforeEach } from 'bun:test'
import { clearBootstrap, initBootstrap } from '../../src/lib/bootstrap'
import { initSettings, getSetting } from '../../src/lib/settings'
import { clearDb } from '../helpers'

describe('install complete → signing key', () => {
  beforeEach(async () => {
    await clearDb()
    clearBootstrap()
    await initBootstrap()
  })

  it('seeds a keypair after the install wizard finishes', async () => {
    // The /api/init/complete handler calls `process.exit()` shortly after
    // saving the keypair, so we can't drive the HTTP route end-to-end inside
    // a test process. Instead, exercise the exact tail-of-install sequence the
    // route performs: initSettings + ensureSigningKey, and assert the public
    // JWK lands in the settings table before the simulated restart.
    expect(getSetting('registry.signing_key.public')).toBeUndefined()
    const { ensureSigningKey } = await import('../../src/lib/registry-key')
    await initSettings()
    await ensureSigningKey()
    expect(getSetting('registry.signing_key.public')).toBeTruthy()
    expect(getSetting('registry.signing_key.private')).toBeTruthy()
    expect(getSetting('registry.signing_key.kid')).toHaveLength(16)
  })

  it('is idempotent across simulated boots (matches bootNormalMode wiring)', async () => {
    const { ensureSigningKey } = await import('../../src/lib/registry-key')
    await initSettings()
    await ensureSigningKey()
    const kid1 = getSetting('registry.signing_key.kid')
    // Simulate a second boot calling ensureSigningKey() again — the key must
    // not be regenerated, otherwise existing signed integrity payloads would
    // stop validating against the published JWKS.
    await ensureSigningKey()
    expect(getSetting('registry.signing_key.kid')).toBe(kid1)
  })
})
