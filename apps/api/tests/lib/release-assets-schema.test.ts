import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, makePlugin } from '../helpers'
import { db } from '../../src/db'
import { releases, releaseAssets } from '../../src/db/schema'

describe('release_assets schema', () => {
  beforeEach(clearDb)

  it('inserts and reads a row with sha256 + size + nullable attestation_bundle', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const releaseId = ulid()
    await db.insert(releases).values({ id: releaseId, pluginId: plugin.id, version: '1.0.0', assets: '{}' })
    await db.insert(releaseAssets).values({
      id: ulid(),
      releaseId,
      name: 'plugin.zip',
      url: 'https://e/plugin.zip',
      size: 1024,
      sha256: 'a'.repeat(64),
      contentType: 'application/zip',
      arch: 'x64',
      os: 'linux',
      attestationBundle: null,
    })
    const rows = await db.select().from(releaseAssets)
    expect(rows).toHaveLength(1)
    expect(rows[0].sha256).toBe('a'.repeat(64))
  })

  it('enforces unique (release_id, name)', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const releaseId = ulid()
    await db.insert(releases).values({ id: releaseId, pluginId: plugin.id, version: '1.0.0', assets: '{}' })
    const base = { releaseId, name: 'plugin.zip', url: 'https://e/p.zip', size: 1, sha256: 'b'.repeat(64) }
    await db.insert(releaseAssets).values({ id: ulid(), ...base })
    await expect(
      (async () => {
        await db.insert(releaseAssets).values({ id: ulid(), ...base })
      })(),
    ).rejects.toThrow()
  })
})
