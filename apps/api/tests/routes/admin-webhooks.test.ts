import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import {
  clearDb,
  buildApp,
  makeAdmin,
  makeUser,
  makePlugin,
  adminHeaders,
  userHeaders,
  type TestUser,
} from '../helpers'
import { db } from '../../src/db'
import { webhookDeliveries } from '../../src/db/schema'
import { setSetting } from '../../src/lib/settings'
import { ALLOW_PRIVATE_SETTING, processDueDeliveries } from '../../src/lib/webhooks/delivery'

// Local receiver standing in for Discord / turboSMTP / any HTTP target.
type Hit = { method: string; path: string; headers: Headers; body: string }
const hits: Hit[] = []
let nextStatus = 204
const receiver = Bun.serve({
  port: 0,
  async fetch(req) {
    hits.push({ method: req.method, path: new URL(req.url).pathname, headers: req.headers, body: await req.text() })
    return new Response(nextStatus === 204 ? null : 'nope', { status: nextStatus })
  },
})
afterAll(() => receiver.stop(true))
const target = `http://127.0.0.1:${receiver.port}`

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const app = await buildApp()
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

// First attempts run in a microtask; let them settle.
async function settle() {
  for (let i = 0; i < 20; i++) {
    const pending = await db.query.webhookDeliveries.findMany({ where: { status: 'sending' } })
    if (pending.length === 0) return
    await Bun.sleep(10)
  }
}

async function createHook(admin: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await call('POST', '/api/admin/webhooks/', adminHeaders(admin), {
    name: 'Discord moderation',
    preset: 'discord',
    events: ['plugin.approved', 'plugin.rejected'],
    url: `{{secrets.HOOK_URL | raw}}/discord`,
    headers: [{ name: 'Authorization', value: 'Bearer {{secrets.TOKEN}}' }],
    body: '{"content":"{{event.title}}","reason":"{{event.reason}}","by":"{{event.actor.name}}"}',
    secrets: { HOOK_URL: target, TOKEN: 'super-secret-token' },
    signingSecret: 'sign-me',
    ...overrides,
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { webhook: { id: string; secretNames: string[] } }).webhook
}

describe('admin webhooks', () => {
  let admin: TestUser
  beforeEach(async () => {
    await clearDb()
    await setSetting(ALLOW_PRIVATE_SETTING, '1')
    hits.length = 0
    nextStatus = 204
    admin = await makeAdmin()
  })

  it('creates a webhook without ever returning secret values', async () => {
    const hook = await createHook(admin)
    expect(hook.secretNames).toEqual(['HOOK_URL', 'TOKEN'])
    const res = await call('GET', `/api/admin/webhooks/${hook.id}`, adminHeaders(admin))
    const text = await res.text()
    expect(text).not.toContain('super-secret-token')
    expect(text).toContain('"hasSigningSecret":true')
  })

  it('rejects invalid templates and unknown events', async () => {
    for (const bad of [
      { body: '{{#if x}}' },
      { events: ['plugin.exploded'] },
      { headers: [{ name: 'Bad Header', value: 'x' }] },
      { secrets: { lower: 'x' } },
    ]) {
      const res = await call('POST', '/api/admin/webhooks/', adminHeaders(admin), {
        name: 'x',
        events: ['plugin.approved'],
        url: 'https://example.com',
        ...bad,
      })
      expect(res.status).toBe(400)
    }
  })

  it('is admin-only', async () => {
    const user = await makeUser({ username: 'someone' })
    const res = await call('GET', '/api/admin/webhooks/', userHeaders(user))
    expect(res.status).toBe(403)
  })

  it('fires on plugin rejection with rendered template, secrets and signature', async () => {
    const hook = await createHook(admin)
    const owner = await makeUser({ username: 'owner' })
    await makePlugin(owner.id, { id: 'alpha', name: 'Alpha', status: 'pending' })

    const res = await call('PATCH', '/api/admin/plugins/alpha', adminHeaders(admin), {
      status: 'rejected',
      rejectionReason: 'Missing "license" file',
    })
    expect(res.status).toBe(200)
    await settle()

    expect(hits).toHaveLength(1)
    const hit = hits[0]
    expect(hit.path).toBe('/discord')
    expect(hit.headers.get('authorization')).toBe('Bearer super-secret-token')
    expect(hit.headers.get('x-tabularium-event')).toBe('plugin.rejected')
    expect(hit.headers.get('x-tabularium-signature')).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(JSON.parse(hit.body)).toEqual({
      content: 'Plugin rejected: Alpha',
      reason: 'Missing "license" file',
      by: 'admin',
    })

    const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hook.id))
    expect(delivery.status).toBe('success')
    expect(delivery.request).not.toContain('super-secret-token')
  })

  it('does not fire for unsubscribed events or unchanged status', async () => {
    await createHook(admin, { events: ['plugin.approved'] })
    const owner = await makeUser({ username: 'owner' })
    await makePlugin(owner.id, { id: 'alpha', status: 'approved' })
    await call('PATCH', '/api/admin/plugins/alpha', adminHeaders(admin), { status: 'approved' })
    await call('PATCH', '/api/admin/plugins/alpha', adminHeaders(admin), { status: 'rejected' })
    await settle()
    expect(hits).toHaveLength(0)
  })

  it('emits one event per changed plugin on bulk approve', async () => {
    await createHook(admin)
    const owner = await makeUser({ username: 'owner' })
    await makePlugin(owner.id, { id: 'alpha', status: 'pending' })
    await makePlugin(owner.id, { id: 'beta', status: 'approved' })
    await call('POST', '/api/admin/plugins/bulk/', adminHeaders(admin), { ids: ['alpha', 'beta'], action: 'approve' })
    await settle()
    expect(hits).toHaveLength(1)
    expect(JSON.parse(hits[0].body).content).toBe('Plugin approved: Test Plugin')
  })

  it('retries 5xx failures and records the attempt', async () => {
    const hook = await createHook(admin)
    const owner = await makeUser({ username: 'owner' })
    await makePlugin(owner.id, { id: 'alpha', status: 'pending' })
    nextStatus = 503
    await call('PATCH', '/api/admin/plugins/alpha', adminHeaders(admin), { status: 'approved' })
    await settle()

    let [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hook.id))
    expect(d.status).toBe('pending')
    expect(d.attempts).toBe(1)
    expect(d.lastStatusCode).toBe(503)

    // Make it due and let the worker pick it up.
    nextStatus = 204
    await db
      .update(webhookDeliveries)
      .set({ nextAttemptAt: Date.now() - 1 })
      .where(eq(webhookDeliveries.id, d.id))
    expect(await processDueDeliveries()).toBe(1)
    ;[d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, d.id))
    expect(d.status).toBe('success')
    expect(d.attempts).toBe(2)
    expect(hits).toHaveLength(2)
  })

  it('does not retry 4xx failures', async () => {
    const hook = await createHook(admin)
    const owner = await makeUser({ username: 'owner' })
    await makePlugin(owner.id, { id: 'alpha', status: 'pending' })
    nextStatus = 400
    await call('PATCH', '/api/admin/plugins/alpha', adminHeaders(admin), { status: 'approved' })
    await settle()
    const [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hook.id))
    expect(d.status).toBe('failed')
    expect(d.responseBody).toBe('nope')
  })

  it('blocks private targets unless allowed', async () => {
    await setSetting(ALLOW_PRIVATE_SETTING, '0')
    const hook = await createHook(admin)
    const res = await call('POST', `/api/admin/webhooks/${hook.id}/test`, adminHeaders(admin), {})
    const { delivery } = (await res.json()) as { delivery: { status: string; lastError: string } }
    expect(delivery.status).toBe('failed')
    expect(delivery.lastError).toContain('private address')
    expect(hits).toHaveLength(0)
  })

  it('sends a test delivery with sample data, even when disabled', async () => {
    const hook = await createHook(admin, { enabled: false })
    const res = await call('POST', `/api/admin/webhooks/${hook.id}/test`, adminHeaders(admin), {
      event: 'plugin.rejected',
    })
    expect(res.status).toBe(200)
    const { delivery } = (await res.json()) as { delivery: { status: string; event: string } }
    expect(delivery).toMatchObject({ status: 'success', event: 'plugin.rejected' })
    expect(JSON.parse(hits[0].body).content).toBe('Plugin rejected: Example Plugin')
  })

  it('previews a draft without sending and masks stored secrets', async () => {
    const hook = await createHook(admin)
    const res = await call('POST', '/api/admin/webhooks/preview', adminHeaders(admin), {
      event: 'release.published',
      webhookId: hook.id,
      secretNames: ['NEW_ONE'],
      definition: {
        url: 'https://api.example.com/{{secrets.NEW_ONE | raw}}',
        headers: [{ name: 'X-Token', value: '{{secrets.TOKEN}}' }],
        body: '{"v":"{{release.version}}","x":"{{plugin.nope}}"}',
      },
    })
    const out = (await res.json()) as {
      ok: boolean
      request: { url: string; headers: Record<string, string>; body: string; missing: string[] }
    }
    expect(out.ok).toBe(true)
    expect(out.request.url).toBe('https://api.example.com/<NEW_ONE>')
    expect(out.request.headers['X-Token']).toBe('••••••••')
    expect(JSON.parse(out.request.body).v).toBe('1.2.0')
    expect(out.request.missing).toEqual(['plugin.nope'])
    expect(hits).toHaveLength(0)
  })

  it('previews typed secret values masked', async () => {
    const res = await call('POST', '/api/admin/webhooks/preview', adminHeaders(admin), {
      secrets: { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/typed-token' },
      definition: { url: '{{secrets.DISCORD_WEBHOOK_URL | raw}}', body: '{}' },
    })
    const out = (await res.json()) as { ok: boolean; request: { url: string } }
    expect(out.ok).toBe(true)
    expect(out.request.url).toBe('••••••••')
  })

  it('merges secrets on update and lists deliveries', async () => {
    const hook = await createHook(admin)
    const res = await call('PATCH', `/api/admin/webhooks/${hook.id}`, adminHeaders(admin), {
      secrets: { TOKEN: null, OTHER: 'x' },
    })
    const { webhook } = (await res.json()) as { webhook: { secretNames: string[] } }
    expect(webhook.secretNames).toEqual(['HOOK_URL', 'OTHER'])

    await call('POST', `/api/admin/webhooks/${hook.id}/test`, adminHeaders(admin), {})
    const list = await call('GET', `/api/admin/webhooks/${hook.id}/deliveries`, adminHeaders(admin))
    const { deliveries } = (await list.json()) as { deliveries: Array<{ id: string }> }
    expect(deliveries).toHaveLength(1)

    const re = await call('POST', `/api/admin/webhook-deliveries/${deliveries[0].id}/redeliver`, adminHeaders(admin))
    expect(((await re.json()) as { delivery: { status: string } }).delivery.status).toBe('success')
    expect(hits).toHaveLength(2)
  })

  it('cascades deliveries on delete', async () => {
    const hook = await createHook(admin)
    await call('POST', `/api/admin/webhooks/${hook.id}/test`, adminHeaders(admin), {})
    const res = await call('DELETE', `/api/admin/webhooks/${hook.id}`, adminHeaders(admin))
    expect(res.status).toBe(200)
    expect(await db.select().from(webhookDeliveries)).toHaveLength(0)
  })
})
