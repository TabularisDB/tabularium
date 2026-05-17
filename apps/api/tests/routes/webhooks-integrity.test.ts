import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
import { db } from '../../src/db'
import { releaseAssets, releases } from '../../src/db/schema'

async function sha256Hex(bytes: Uint8Array) {
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function signPayload(secret: string, body: string) {
  const hasher = new Bun.CryptoHasher('sha256', secret)
  hasher.update(Buffer.from(body))
  return 'sha256=' + hasher.digest('hex')
}

/**
 * NOTE: `isPublicHttpUrl` blocks `localhost` for SSRF safety in prod. The
 * test-mode bypass in `apps/api/src/lib/url.ts` (NODE_ENV === 'test') lets
 * the in-process Bun.serve fixture be fetched by `hashAsset`.
 */
describe('webhook ingest → release_assets', () => {
  let server: ReturnType<typeof Bun.serve>
  const FIXTURE = new TextEncoder().encode('fake-plugin-binary')
  let FIXTURE_SHA: string

  beforeEach(async () => {
    await clearDb()
    server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE) })
    FIXTURE_SHA = await sha256Hex(FIXTURE)
  })

  afterEach(() => {
    server.stop(true)
  })

  it('inserts one release_assets row per platform asset with computed sha256', async () => {
    const secret = 'x'.repeat(32)
    const user = await makeUser()
    const plugin = await makePlugin(user.id, {
      status: 'approved',
      webhookSecret: secret,
      repoUrl: 'https://github.com/alice/integrity-plugin',
    })

    const assetName = 'plugin-linux-x64.zip'
    const assetUrl = `http://localhost:${server.port}/${assetName}`
    const body = JSON.stringify({
      action: 'published',
      release: {
        tag_name: 'v1.0.0',
        assets: [{ name: assetName, browser_download_url: assetUrl }],
      },
      repository: { html_url: plugin.repoUrl },
    })
    const sig = await signPayload(secret, body)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/webhooks/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig,
          'x-github-event': 'release',
        },
        body,
      }),
    )
    expect(res.status).toBe(200)

    // hash + insert happens in queueMicrotask — yield once for it to drain.
    await new Promise((r) => setTimeout(r, 100))

    const release = await db.query.releases.findFirst({ where: { pluginId: plugin.id } })
    expect(release).toBeTruthy()

    const rows = await db.select().from(releaseAssets).where(eq(releaseAssets.releaseId, release!.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe(assetName)
    expect(rows[0].url).toBe(assetUrl)
    expect(rows[0].sha256).toBe(FIXTURE_SHA)
    expect(rows[0].size).toBe(FIXTURE.byteLength)
  })

  it('upserts on (release_id, name) — re-delivery does not duplicate rows', async () => {
    const secret = 'x'.repeat(32)
    const user = await makeUser()
    const plugin = await makePlugin(user.id, {
      status: 'approved',
      webhookSecret: secret,
      repoUrl: 'https://github.com/alice/integrity-plugin',
    })

    const assetName = 'plugin-linux-x64.zip'
    const assetUrl = `http://localhost:${server.port}/${assetName}`
    const body = JSON.stringify({
      action: 'published',
      release: {
        tag_name: 'v1.0.0',
        assets: [{ name: assetName, browser_download_url: assetUrl }],
      },
      repository: { html_url: plugin.repoUrl },
    })
    const sig = await signPayload(secret, body)
    const app = await buildApp()

    const send = () =>
      app.handle(
        new Request('http://localhost/api/webhooks/release', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': sig,
            'x-github-event': 'release',
          },
          body,
        }),
      )

    expect((await send()).status).toBe(200)
    await new Promise((r) => setTimeout(r, 100))
    expect((await send()).status).toBe(200)
    await new Promise((r) => setTimeout(r, 100))

    const rows = await db.select().from(releaseAssets)
    expect(rows).toHaveLength(1)
    expect(rows[0].sha256).toBe(FIXTURE_SHA)
  })
})
