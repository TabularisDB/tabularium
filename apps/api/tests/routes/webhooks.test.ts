import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
import { db } from '../../src/db'

function makeGithubReleasePayload(repoUrl: string, tagName: string, assetName: string) {
  return {
    action: 'published',
    release: {
      tag_name: tagName,
      assets: [
        {
          name: assetName,
          browser_download_url: `https://github.com/owner/repo/releases/download/${tagName}/${assetName}`,
        },
      ],
    },
    repository: { html_url: repoUrl },
  }
}

async function signPayload(secret: string, body: string) {
  const hasher = new Bun.CryptoHasher('sha256', secret)
  hasher.update(Buffer.from(body))
  return 'sha256=' + hasher.digest('hex')
}

describe('POST /api/webhooks/release', () => {
  beforeEach(clearDb)

  it('returns 401 (not 404) when plugin not found, to avoid existence oracle', async () => {
    const body = JSON.stringify(
      makeGithubReleasePayload('https://github.com/nobody/repo', 'v1.0.0', 'plugin-linux-x64.zip'),
    )
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/webhooks/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid',
          'x-github-event': 'release',
        },
        body,
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 when HMAC signature is wrong', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id, {
      repoUrl: 'https://github.com/alice/my-plugin',
      webhookSecret: 'real-secret-padded-to-thirty-two-chars',
    })

    const body = JSON.stringify(makeGithubReleasePayload(plugin.repoUrl, 'v1.0.0', 'plugin-linux-x64.zip'))
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/webhooks/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=wrongsig',
          'x-github-event': 'release',
        },
        body,
      }),
    )
    expect(res.status).toBe(401)
  })

  it('creates release and updates latest_version on valid webhook', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id, {
      repoUrl: 'https://github.com/alice/my-plugin',
      webhookSecret: 'test-secret-padded-to-thirty-two-chars',
    })

    const payload = makeGithubReleasePayload(plugin.repoUrl, 'v1.2.0', 'my-plugin-linux-x64.zip')
    const body = JSON.stringify(payload)
    const sig = await signPayload('test-secret-padded-to-thirty-two-chars', body)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/webhooks/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': sig,
          'x-github-event': 'release',
        },
        body,
      }),
    )
    expect(res.status).toBe(200)

    const release = await db.query.releases.findFirst({
      where: { pluginId: plugin.id },
    })
    expect(release?.version).toBe('1.2.0')
    const assets = JSON.parse(release!.assets) as Record<string, { url: string }>
    expect(assets['linux-x64'].url).toContain('my-plugin-linux-x64.zip')

    const updatedPlugin = await db.query.plugins.findFirst({
      where: { id: plugin.id },
    })
    expect(updatedPlugin?.latestVersion).toBe('1.2.0')
  })

  it('skips non-published actions', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id, {
      repoUrl: 'https://github.com/alice/my-plugin',
      webhookSecret: 'test-secret-padded-to-thirty-two-chars',
    })

    const payload = {
      action: 'created',
      release: { tag_name: 'v1.0.0', assets: [] },
      repository: { html_url: plugin.repoUrl },
    }
    const body = JSON.stringify(payload)
    const sig = await signPayload('test-secret-padded-to-thirty-two-chars', body)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/webhooks/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': sig,
          'x-github-event': 'release',
        },
        body,
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { skipped: boolean }
    expect(data.skipped).toBe(true)
  })
})
