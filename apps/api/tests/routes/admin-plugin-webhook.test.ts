import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { identities } from '../../src/db/schema'
import { createAdminToken } from '../../src/lib/admin-tokens'
import { adminHeaders, buildApp, clearDb, makeAdmin, makePlugin, makeUser, userHeaders } from '../helpers'

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/release'
const SECRET = 'a'.repeat(64)
let fetchSpy: ReturnType<typeof spyOn> | null = null

beforeEach(clearDb)
afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = null
})

function mockHooks(rows: unknown = [], status = 200) {
  fetchSpy = spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(rows), { status }))
}

const validHook = {
  id: 42,
  active: true,
  events: ['release'],
  config: { url: WEBHOOK_URL, content_type: 'json', secret: 'provider-masked-secret' },
}

describe('GET /api/admin/plugins/:id/webhook', () => {
  it('checks the plugin repository with the owner token and returns the existing manual setup values', async () => {
    const admin = await makeAdmin({ accessToken: 'admin-token' })
    const owner = await makeUser({ accessToken: 'owner-token' })
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET, status: 'pending' })
    mockHooks([validHook, { ...validHook, id: 43, config: { url: 'https://unrelated.example', secret: 'unrelated' } }])

    const res = await (await buildApp()).handle(
      new Request(`http://localhost/api/admin/plugins/${plugin.id}/webhook`, { headers: adminHeaders(admin) }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const data = await res.json()
    expect(data).toMatchObject({
      status: 'configured',
      reason: null,
      webhookUrl: WEBHOOK_URL,
      webhookSecret: SECRET,
      provider: 'GitHub',
      settingsUrl: 'https://github.com/testuser/test-plugin/settings/hooks',
      events: ['release'],
      contentType: 'application/json',
      hooks: [{ id: 42, active: true, releaseEvents: true, contentType: 'json' }],
    })
    expect(JSON.stringify(data)).not.toContain('provider-masked-secret')
    expect(JSON.stringify(data)).not.toContain('unrelated')
    const [url, init] = fetchSpy!.mock.calls[0]!
    expect(String(url)).toBe('https://api.github.com/repos/testuser/test-plugin/hooks?per_page=100&page=1')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer owner-token')
    expect(init?.method).toBeUndefined() // inspection never creates or changes hooks
    expect((await db.query.plugins.findFirst({ where: { id: plugin.id } }))?.webhookSecret).toBe(SECRET)
  })

  it('uses the selected plugin repository and secret even though plugins share a callback URL', async () => {
    const admin = await makeAdmin()
    const owner = await makeUser()
    await makePlugin(owner.id, { id: 'alpha', webhookSecret: SECRET })
    await makePlugin(owner.id, {
      id: 'beta',
      repoUrl: 'https://github.com/another/beta',
      webhookSecret: 'b'.repeat(64),
    })
    mockHooks([])
    const res = await (await buildApp()).handle(
      new Request('http://localhost/api/admin/plugins/beta/webhook', { headers: adminHeaders(admin) }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.webhookSecret).toBe('b'.repeat(64))
    expect(data.settingsUrl).toBe('https://github.com/another/beta/settings/hooks')
    expect(String(fetchSpy!.mock.calls[0]![0])).toContain('/repos/another/beta/hooks?')
  })

  it('reports missing only after successfully listing the repository hooks', async () => {
    const admin = await makeAdmin()
    const plugin = await makePlugin(admin.id, { webhookSecret: SECRET })
    mockHooks([{ ...validHook, config: { url: 'https://old-registry.example/api/webhooks/release' } }])
    const res = await (await buildApp()).handle(
      new Request(`http://localhost/api/admin/plugins/${plugin.id}/webhook`, { headers: adminHeaders(admin) }),
    )
    expect(await res.json()).toMatchObject({ status: 'missing', hooks: [], webhookSecret: SECRET })
  })

  it.each([401, 403, 404, 429, 500])('keeps setup values available when GitHub returns %s', async (status) => {
    const admin = await makeAdmin()
    const plugin = await makePlugin(admin.id, { webhookSecret: SECRET })
    mockHooks({ message: 'upstream failure' }, status)
    const res = await (await buildApp()).handle(
      new Request(`http://localhost/api/admin/plugins/${plugin.id}/webhook`, { headers: adminHeaders(admin) }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'unknown', webhookSecret: SECRET, webhookUrl: WEBHOOK_URL })
  })

  it('provides manual setup without a linked owner account', async () => {
    const admin = await makeAdmin()
    const owner = await makeUser()
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET })
    await db.delete(identities).where(eq(identities.id, owner.identityId))
    await db.delete(identities).where(eq(identities.id, admin.identityId))
    mockHooks()
    const res = await (await buildApp()).handle(
      new Request(`http://localhost/api/admin/plugins/${plugin.id}/webhook`, { headers: adminHeaders(admin) }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'unknown', webhookSecret: SECRET })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('provides manual setup when the owner token has expired', async () => {
    const admin = await makeAdmin()
    const owner = await makeUser()
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET })
    await db
      .update(identities)
      .set({ accessTokenExpiresAt: Date.now() - 1000 })
      .where(eq(identities.id, owner.identityId))
    await db.delete(identities).where(eq(identities.id, admin.identityId))
    mockHooks()
    const res = await (await buildApp()).handle(
      new Request(`http://localhost/api/admin/plugins/${plugin.id}/webhook`, { headers: adminHeaders(admin) }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'unknown', webhookSecret: SECRET })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  function mockHooksByToken(byToken: Record<string, { rows: unknown; status: number }>) {
    fetchSpy = spyOn(global, 'fetch').mockImplementation((async (_url: unknown, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization.replace('Bearer ', '')
      const { rows, status } = byToken[auth] ?? { rows: { message: 'Not Found' }, status: 404 }
      return new Response(JSON.stringify(rows), { status })
    }) as typeof fetch)
  }

  const webhookOf = async (admin: { id: string }, pluginId: string) =>
    (await buildApp()).handle(
      new Request(`http://localhost/api/admin/plugins/${pluginId}/webhook`, {
        headers: adminHeaders(admin as Parameters<typeof adminHeaders>[0]),
      }),
    )

  it("falls back to the calling admin's token when the owner's cannot read the hooks", async () => {
    const admin = await makeAdmin({ accessToken: 'admin-token' })
    const owner = await makeUser({ accessToken: 'owner-token' })
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET })
    mockHooksByToken({
      'owner-token': { rows: { message: 'Not Found' }, status: 404 },
      'admin-token': { rows: [validHook], status: 200 },
    })
    const data = await (await webhookOf(admin, plugin.id)).json()
    expect(data).toMatchObject({ status: 'configured', reason: null, checkedAs: 'admin', webhookSecret: SECRET })
    const tokens = fetchSpy!.mock.calls.map(
      ([, init]: [unknown, RequestInit?]) => (init?.headers as Record<string, string>).Authorization,
    )
    expect(tokens).toEqual(['Bearer owner-token', 'Bearer admin-token'])
  })

  it('falls back to the admin when the owner has no linked account', async () => {
    const admin = await makeAdmin({ accessToken: 'admin-token' })
    const owner = await makeUser()
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET })
    await db.delete(identities).where(eq(identities.id, owner.identityId))
    mockHooksByToken({ 'admin-token': { rows: [], status: 200 } })
    expect(await (await webhookOf(admin, plugin.id)).json()).toMatchObject({ status: 'missing', checkedAs: 'admin' })
  })

  it("keeps the owner's reason when the admin's token cannot read the hooks either", async () => {
    const admin = await makeAdmin({ accessToken: 'admin-token' })
    const owner = await makeUser({ accessToken: 'owner-token' })
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET })
    mockHooksByToken({})
    const data = await (await webhookOf(admin, plugin.id)).json()
    expect(data).toMatchObject({ status: 'unknown', checkedAs: null, webhookSecret: SECRET })
    expect(data.reason).toContain('HTTP 404')
    expect(data.reason).toContain('Your own linked account could not read them either.')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the calling admin owns the plugin', async () => {
    const admin = await makeAdmin({ accessToken: 'admin-token' })
    const plugin = await makePlugin(admin.id, { webhookSecret: SECRET })
    mockHooksByToken({})
    const data = await (await webhookOf(admin, plugin.id)).json()
    expect(data).toMatchObject({ status: 'unknown', checkedAs: null })
    expect(data.reason).not.toContain('either')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('reports the owner as the checker when the owner token works', async () => {
    const admin = await makeAdmin({ accessToken: 'admin-token' })
    const owner = await makeUser({ accessToken: 'owner-token' })
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET })
    mockHooksByToken({ 'owner-token': { rows: [validHook], status: 200 } })
    expect(await (await webhookOf(admin, plugin.id)).json()).toMatchObject({ status: 'configured', checkedAs: 'owner' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('protects the secret from anonymous users, plugin owners, and tokens for other admin areas', async () => {
    const admin = await makeAdmin()
    const owner = await makeUser()
    const plugin = await makePlugin(owner.id, { webhookSecret: SECRET })
    const { token } = await createAdminToken({ userId: admin.id, name: 'reader', scopes: ['admin:webhooks:read'] })
    const app = await buildApp()
    mockHooks()
    for (const [headers, expected] of [
      [{}, 401],
      [userHeaders(owner), 403],
      [{ Authorization: `Bearer ${token}` }, 403],
    ] as const) {
      const res = await app.handle(new Request(`http://localhost/api/admin/plugins/${plugin.id}/webhook`, { headers }))
      expect(res.status).toBe(expected)
      expect(await res.text()).not.toContain(SECRET)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown plugin', async () => {
    const admin = await makeAdmin()
    const res = await (await buildApp()).handle(
      new Request('http://localhost/api/admin/plugins/not-found/webhook', { headers: adminHeaders(admin) }),
    )
    expect(res.status).toBe(404)
  })
})
