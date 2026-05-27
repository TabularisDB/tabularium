import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { compactVerify, importJWK } from 'jose'
import { clearDb, makeUser, makePlugin } from '../helpers'
import { db } from '../../src/db'
import { releases, releaseAssets } from '../../src/db/schema'
import { ensureSigningKey, getCurrentPublicJwk } from '../../src/lib/registry-key'
import { buildIntegrity } from '../../src/lib/release-integrity'
import { env } from '../../src/lib/env'

describe('buildIntegrity', () => {
  beforeEach(clearDb)

  it('returns { jws, assets } with sha256 + size per asset; jws verifies via JWKS', async () => {
    await ensureSigningKey()
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const releaseId = ulid()
    await db.insert(releases).values({
      id: releaseId,
      pluginId: plugin.id,
      version: '1.2.3',
      assets: '{}',
      manifestSha256: 'c'.repeat(64),
    })
    await db.insert(releaseAssets).values({
      id: ulid(),
      releaseId,
      name: 'p.zip',
      url: 'https://e/p.zip',
      size: 12345,
      sha256: 'a'.repeat(64),
    })

    const integrity = await buildIntegrity({ slug: plugin.id, version: '1.2.3' })
    expect(integrity).not.toBeNull()
    expect(integrity!.assets).toHaveLength(1)
    expect(integrity!.assets[0]).toMatchObject({
      name: 'p.zip',
      sha256: 'a'.repeat(64),
      size: 12345,
      attestation_bundle: null,
    })

    const jwk = await getCurrentPublicJwk()
    const key = await importJWK(jwk as any, 'EdDSA')
    const { payload, protectedHeader } = await compactVerify(integrity!.jws, key)
    expect(protectedHeader.alg).toBe('EdDSA')
    expect(protectedHeader.kid).toBe(jwk.kid)

    const body = JSON.parse(new TextDecoder().decode(payload)) as {
      v: number
      kid: string
      issued_at: number
      registry: string
      plugin_slug: string
      release_version: string
      manifest_sha256: string
      assets: Array<{ name: string; sha256: string; size: number }>
    }
    expect(body.v).toBe(1)
    expect(body.kid).toBe(jwk.kid)
    expect(typeof body.issued_at).toBe('number')
    expect(body.registry).toBe(env.BASE_URL)
    expect(body.plugin_slug).toBe(plugin.id)
    expect(body.release_version).toBe('1.2.3')
    expect(body.manifest_sha256).toBe('c'.repeat(64))
    expect(body.assets).toEqual([{ name: 'p.zip', sha256: 'a'.repeat(64), size: 12345 }])
  })

  it('returns null when no release_assets rows exist (legacy release)', async () => {
    await ensureSigningKey()
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const releaseId = ulid()
    await db.insert(releases).values({
      id: releaseId,
      pluginId: plugin.id,
      version: '1.0.0',
      assets: '{}',
    })
    const integrity = await buildIntegrity({ slug: plugin.id, version: '1.0.0' })
    expect(integrity).toBeNull()
  })

  it('returns null when the release does not exist', async () => {
    await ensureSigningKey()
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const integrity = await buildIntegrity({ slug: plugin.id, version: '9.9.9' })
    expect(integrity).toBeNull()
  })

  it('passes through attestation_bundle when present', async () => {
    await ensureSigningKey()
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const releaseId = ulid()
    const bundle = { mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3', dsseEnvelope: { payload: 'x' } }
    await db.insert(releases).values({
      id: releaseId,
      pluginId: plugin.id,
      version: '2.0.0',
      assets: '{}',
      manifestSha256: 'd'.repeat(64),
    })
    await db.insert(releaseAssets).values({
      id: ulid(),
      releaseId,
      name: 'p.zip',
      url: 'https://e/p.zip',
      size: 1,
      sha256: 'b'.repeat(64),
      attestationBundle: JSON.stringify(bundle),
    })
    const integrity = await buildIntegrity({ slug: plugin.id, version: '2.0.0' })
    expect(integrity).not.toBeNull()
    expect(integrity!.assets[0].attestation_bundle).toEqual(bundle)
  })
})
