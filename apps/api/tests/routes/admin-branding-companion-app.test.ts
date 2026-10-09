import { describe, it, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { getSetting } from '../../src/lib/settings'

async function adminCookie() {
  const admin = await makeUser({ role: 'admin', username: 'admin' })
  const jwt = await signJwt({
    sub: admin.id,
    identityId: admin.identityId,
    username: admin.username,
    providerInstanceId: admin.providerInstanceId,
  })
  return { Cookie: `auth=${jwt}` }
}

async function putBranding(body: Record<string, unknown>) {
  const app = await buildApp()
  return app.handle(
    new Request('http://localhost/api/admin/branding/', {
      method: 'PUT',
      headers: { ...(await adminCookie()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

async function publicCompanionApp() {
  const app = await buildApp()
  const res = await app.handle(new Request('http://localhost/api/branding/'))
  return ((await res.json()) as { companionApp: Record<string, string | null> }).companionApp
}

describe('branding.companionApp', () => {
  beforeEach(clearDb)

  it('is empty by default', async () => {
    expect(await publicCompanionApp()).toEqual({
      name: null,
      url: null,
      downloadUrl: null,
      videoUrl: null,
      videoPosterUrl: null,
    })
  })

  it('sets, exposes publicly, and clears the companion app', async () => {
    const set = await putBranding({
      companionApp: {
        name: 'Tabularis',
        url: 'https://tabularis.dev',
        downloadUrl: 'https://tabularis.dev/download',
        videoUrl: 'https://tabularis.dev/videos/wiki/08-plugins.mp4',
      },
    })
    expect(set.status).toBe(200)
    expect(await publicCompanionApp()).toEqual({
      name: 'Tabularis',
      url: 'https://tabularis.dev',
      downloadUrl: 'https://tabularis.dev/download',
      videoUrl: 'https://tabularis.dev/videos/wiki/08-plugins.mp4',
      videoPosterUrl: null,
    })

    // Partial update: only the listed fields change.
    const clear = await putBranding({ companionApp: { videoUrl: null } })
    expect(clear.status).toBe(200)
    expect(getSetting('branding.app.video_url')).toBeUndefined()
    expect(getSetting('branding.app.name')).toBe('Tabularis')
  })

  it('rejects non-http(s) URLs', async () => {
    const res = await putBranding({ companionApp: { name: 'X', downloadUrl: 'javascript:alert(1)' } })
    expect(res.status).toBe(400)
    expect(getSetting('branding.app.name')).toBeUndefined()
    expect(getSetting('branding.app.download_url')).toBeUndefined()
  })
})
