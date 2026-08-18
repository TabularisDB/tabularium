import { describe, it, expect, beforeEach, spyOn, afterEach } from 'bun:test'
import { clearDb, makeUser, makeAdmin, makePlugin, adminHeaders, buildApp } from '../helpers'
import { db } from '../../src/db'
import { setSetting } from '../../src/lib/settings'

const MANIFEST = JSON.stringify({
  name: 'alpha',
  version: '1.0.0',
  description: 'A test plugin.',
  min_runtime_version: '0.20.0',
})

const MANIFEST_ASSET = 'https://example.com/releases/download/v1.0.0/default.tabularium'

let spy: ReturnType<typeof spyOn> | null = null

function mockForge() {
  spy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
    const u = String(typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url)
    const ok = (body: string) =>
      new Response(body, {
        status: 200,
        headers: { 'content-length': String(new TextEncoder().encode(body).length) },
      })
    if (u.includes('/releases?per_page=')) {
      return ok(
        JSON.stringify([
          {
            tag_name: 'v1.0.0',
            draft: false,
            prerelease: false,
            html_url: 'https://github.com/testuser/test-plugin/releases/tag/v1.0.0',
            assets: [{ name: 'default.tabularium', browser_download_url: MANIFEST_ASSET }],
          },
        ]),
      )
    }
    if (u === MANIFEST_ASSET) return ok(MANIFEST)
    return new Response('not found', { status: 404 })
  }) as unknown as typeof fetch)
}

afterEach(() => {
  spy?.mockRestore()
  spy = null
})

describe('POST /api/admin/plugins/:id/replay-webhook', () => {
  beforeEach(clearDb)

  // Regression: the replay fetched the release (assets and all) but called
  // refreshManifestAtRelease without them. The asset-first resolver then saw an
  // empty list, strict mode declared the manifest missing, and the replay
  // deferred to a delayed recheck — so the operator who pressed the button got
  // no manifest data written, and min_runtime_version stayed NULL.
  it('resolves the manifest inline from the release it just fetched', async () => {
    await setSetting('manifest.require_release_asset', '1')
    const admin = await makeAdmin()
    const owner = await makeUser({ username: 'owner' })
    const plugin = await makePlugin(owner.id, { id: 'alpha', status: 'approved' })
    mockForge()

    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/admin/plugins/${plugin.id}/replay-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders(admin) },
      }),
    )
    expect(res.status).toBe(200)

    // the manifest refresh runs in a microtask kicked off by the handler
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 50))

    const row = await db.query.releases.findFirst({ where: { pluginId: plugin.id, version: '1.0.0' } })
    expect(row?.manifestRaw).toBe(MANIFEST)
    expect(row?.minRuntimeVersion).toBe('0.20.0')
  })
})
