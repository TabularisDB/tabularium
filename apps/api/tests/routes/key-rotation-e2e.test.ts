import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { compactVerify, importJWK, errors as joseErrors } from 'jose'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'
import { db } from '../../src/db'
import { releases, releaseAssets } from '../../src/db/schema'
import { ensureSigningKey, rotateSigningKey, signPayload } from '../../src/lib/registry-key'
import { buildIntegrity } from '../../src/lib/release-integrity'

describe('key rotation e2e', () => {
  beforeEach(clearDb)

  it('preserves verifiability of pre-rotation signatures + signs new releases with the new key', async () => {
    // 1. Sign payload A under key A.
    await ensureSigningKey()
    const jwsA = await signPayload({ marker: 'pre-rotation' })

    // 2. Snapshot key A.
    const app = await buildApp()
    const beforeJwks = await (
      await app.handle(new Request('http://localhost/.well-known/registry-key.json'))
    ).json()
    const kidA = beforeJwks.keys[0].kid

    // 3. Rotate.
    const { oldKid, newKid } = await rotateSigningKey()
    expect(oldKid).toBe(kidA)
    expect(newKid).not.toBe(kidA)

    // 4. JWKS now has both — current (B) and previous (A).
    const afterJwks = await (
      await app.handle(new Request('http://localhost/.well-known/registry-key.json'))
    ).json()
    expect(afterJwks.keys).toHaveLength(2)
    expect(afterJwks.keys[0].kid).toBe(newKid)
    expect(afterJwks.keys[1].kid).toBe(oldKid)

    // 5. Original jwsA verifies against key A in the JWKS (the previous slot).
    const previousJwk = await importJWK(afterJwks.keys[1], 'EdDSA')
    const { payload: oldPayload } = await compactVerify(jwsA, previousJwk)
    expect(JSON.parse(new TextDecoder().decode(oldPayload))).toMatchObject({
      marker: 'pre-rotation',
    })

    // 6. A new release ingested post-rotation gets a JWS signed by key B.
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const releaseId = ulid()
    await db.insert(releases).values({
      id: releaseId,
      pluginId: plugin.id,
      version: '2.0.0',
      assets: '{}',
    })
    await db.insert(releaseAssets).values({
      id: ulid(),
      releaseId,
      name: 'p.zip',
      url: 'https://e/p.zip',
      size: 100,
      sha256: 'd'.repeat(64),
    })

    const integrity = await buildIntegrity({ slug: plugin.id, version: '2.0.0' })
    expect(integrity).not.toBeNull()

    const currentJwk = await importJWK(afterJwks.keys[0], 'EdDSA')
    const { payload: newPayload, protectedHeader } = await compactVerify(
      integrity!.jws,
      currentJwk,
    )
    expect(protectedHeader.kid).toBe(newKid)
    expect(JSON.parse(new TextDecoder().decode(newPayload))).toMatchObject({ kid: newKid })

    // 7. The post-rotation JWS does NOT verify against the previous key.
    await expect(compactVerify(integrity!.jws, previousJwk)).rejects.toBeInstanceOf(
      joseErrors.JWSSignatureVerificationFailed,
    )
  })
})
