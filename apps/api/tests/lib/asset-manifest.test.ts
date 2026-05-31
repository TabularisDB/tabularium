import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { clearDb, makeUser, makePlugin } from '../helpers'
import { db } from '../../src/db'
import { auditLog } from '../../src/db/schema'
import { eq } from 'drizzle-orm'
import { resolveManifestFromReleaseAssets } from '../../src/lib/manifest'
import { refreshManifestAtRelease } from '../../src/lib/release-ingest'
import { setSetting } from '../../src/lib/settings'

const SAMPLE_YAML = `
$schema: https://example.com/manifest.schema.json
name: alpha
version: 1.0.0
description: A test plugin.
category: misc
tags: [test]
`

function mockAssetFetch(byUrl: Record<string, { body: string; status?: number }>) {
  return spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
    const key = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    const m = byUrl[key]
    if (!m) return new Response('not found', { status: 404 })
    return new Response(m.body, {
      status: m.status ?? 200,
      headers: { 'content-length': String(new TextEncoder().encode(m.body).length) },
    })
  }) as unknown as typeof fetch)
}

describe('resolveManifestFromReleaseAssets', () => {
  beforeEach(clearDb)

  it('returns parsed manifest when an asset matches a candidate filename', async () => {
    const spy = mockAssetFetch({
      'https://example.com/.tabularium': { body: SAMPLE_YAML },
    })
    const manifest = await resolveManifestFromReleaseAssets('test-token', [
      { name: '.tabularium', url: 'https://example.com/.tabularium' },
    ])
    expect(manifest?.parsed.name).toBe('alpha')
    expect(manifest?.source).toBe('tabularium.yaml')
    spy.mockRestore()
  })

  it('returns null when no asset name matches the candidate list', async () => {
    const spy = mockAssetFetch({})
    const manifest = await resolveManifestFromReleaseAssets('test-token', [
      { name: 'firestore-plugin-linux-x64.zip', url: 'https://example.com/bin.zip' },
    ])
    expect(manifest).toBeNull()
    spy.mockRestore()
  })

  it('returns null when assets list is empty', async () => {
    const manifest = await resolveManifestFromReleaseAssets('test-token', [])
    expect(manifest).toBeNull()
  })
})

describe('refreshManifestAtRelease asset-first behavior', () => {
  beforeEach(clearDb)

  it('ingests via asset when assets contain a matching manifest', async () => {
    const u = await makeUser()
    const plugin = await makePlugin(u.id, { id: 'alpha' })
    const assetUrl = 'https://codeberg.org/u/alpha/releases/download/v1.0.0/.tabularium'
    const spy = mockAssetFetch({ [assetUrl]: { body: SAMPLE_YAML } })

    const sha = await refreshManifestAtRelease(
      { id: plugin.id, ownerId: u.id, repoUrl: plugin.repoUrl },
      'v1.0.0',
      '1.0.0',
      [{ name: '.tabularium', url: assetUrl }],
    )
    expect(sha).not.toBeNull()
    const row = await db.query.plugins.findFirst({ where: { id: 'alpha' } })
    expect(row?.category).toBe('misc')
    spy.mockRestore()
  })

  it('hard-rejects + audits when no manifest asset is published and require=1', async () => {
    await setSetting('manifest.require_release_asset', '1')
    const u = await makeUser()
    const plugin = await makePlugin(u.id, { id: 'alpha' })
    const spy = mockAssetFetch({})

    const sha = await refreshManifestAtRelease(
      { id: plugin.id, ownerId: u.id, repoUrl: plugin.repoUrl },
      'v1.0.0',
      '1.0.0',
      [{ name: 'binary.zip', url: 'https://example.com/binary.zip' }],
    )
    expect(sha).toBeNull()
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.manifest_asset_missing'))
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].target).toBe('plugin:alpha')
    spy.mockRestore()
  })

  it('falls back to git-ref path when no asset and require=0', async () => {
    await setSetting('manifest.require_release_asset', '0')
    const u = await makeUser()
    const plugin = await makePlugin(u.id, { id: 'alpha' })
    // Asset list empty + git fetch returns 404 → we expect the legacy
    // refresh_failed audit (not the new asset_missing one) to confirm the
    // fallback path actually engaged.
    const spy = mockAssetFetch({})

    const sha = await refreshManifestAtRelease(
      { id: plugin.id, ownerId: u.id, repoUrl: plugin.repoUrl },
      'v1.0.0',
      '1.0.0',
      [],
    )
    expect(sha).toBeNull()
    const missing = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.manifest_asset_missing'))
    expect(missing).toHaveLength(0)
    const refreshFailed = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.manifest_refresh_failed'))
    expect(refreshFailed.length).toBeGreaterThan(0)
    spy.mockRestore()
  }, 15_000)
})
