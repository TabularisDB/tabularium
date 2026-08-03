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

async function putInstance(body: Record<string, unknown>) {
  const app = await buildApp()
  return app.handle(
    new Request('http://localhost/api/admin/instance/', {
      method: 'PUT',
      headers: { ...(await adminCookie()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('docs.external_url setting', () => {
  beforeEach(clearDb)

  it('sets, exposes publicly, and clears the external docs URL', async () => {
    const app = await buildApp()

    const set = await putInstance({ docsExternalUrl: 'https://tabularis.dev/wiki/plugin-development' })
    expect(set.status).toBe(200)
    expect(getSetting('docs.external_url')).toBe('https://tabularis.dev/wiki/plugin-development')

    const info = await app.handle(new Request('http://localhost/api/instance/info/'))
    const body = (await info.json()) as { docsExternalUrl: string | null }
    expect(body.docsExternalUrl).toBe('https://tabularis.dev/wiki/plugin-development')

    const clear = await putInstance({ docsExternalUrl: null })
    expect(clear.status).toBe(200)
    expect(getSetting('docs.external_url')).toBeUndefined()
  })

  it('rejects non-http(s) URLs', async () => {
    const res = await putInstance({ docsExternalUrl: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
    expect(getSetting('docs.external_url')).toBeUndefined()
  })
})
