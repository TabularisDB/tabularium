import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { makeStubHost, type StubHostHandle } from './_stubs'
import { setHost, __resetHostForTests } from '../src/api/host-handles'
import { buildRoutes } from '../src/api/routes'

let stub: StubHostHandle
let realFetch: typeof fetch
let lastDiscordCall: { url: string; body: string } | null

beforeEach(() => {
  __resetHostForTests()
  stub = makeStubHost()
  // routes.ts pulls `host().middleware.admin` at build-time — supply a
  // pass-through Elysia subapp so `.use(...)` works in tests.
  stub.host.middleware.admin = new Elysia()
  setHost(stub.host)
  realFetch = globalThis.fetch
  lastDiscordCall = null
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    lastDiscordCall = { url, body: String(init?.body ?? '') }
    return new Response('', { status: 204 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  stub.reset()
  __resetHostForTests()
})

async function app() {
  return buildRoutes()
}

test('GET /api/admin/discord-notifier returns masked settings with defaults', async () => {
  const a = await app()
  const res = await a.handle(new Request('http://localhost/api/admin/discord-notifier/'))
  expect(res.status).toBe(200)
  const body = (await res.json()) as {
    webhookUrlSet: boolean
    username: string | null
    enabledEvents: string[]
  }
  expect(body.webhookUrlSet).toBe(false)
  expect(body.username).toBeNull()
  expect(body.enabledEvents).toEqual(['plugin.approved', 'plugin.rejected', 'account.welcome'])
})

test('PUT /api/admin/discord-notifier writes webhook URL encrypted', async () => {
  const a = await app()
  const res = await a.handle(
    new Request('http://localhost/api/admin/discord-notifier/', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        webhookUrl: 'https://discord.test/secret-hook',
        username: 'Newt-Bot',
        enabledEvents: ['plugin.approved'],
      }),
    }),
  )
  expect(res.status).toBe(200)
  const stored = stub.settings.get('discord-notifier.webhook_url')
  expect(stored).toEqual({ value: 'https://discord.test/secret-hook', encrypted: true })
  expect(stub.settings.get('discord-notifier.username')?.value).toBe('Newt-Bot')
  expect(JSON.parse(stub.settings.get('discord-notifier.enabled_events')!.value)).toEqual(['plugin.approved'])
})

test('PUT with empty webhookUrl deletes the credential', async () => {
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://existing', { encrypted: true })
  const a = await app()
  await a.handle(
    new Request('http://localhost/api/admin/discord-notifier/', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ webhookUrl: '' }),
    }),
  )
  expect(stub.settings.has('discord-notifier.webhook_url')).toBe(false)
})

test('GET masks webhook URL — only ever exposes webhookUrlSet boolean', async () => {
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/secret', { encrypted: true })
  const a = await app()
  const res = await a.handle(new Request('http://localhost/api/admin/discord-notifier/'))
  const body = (await res.json()) as { webhookUrlSet: boolean }
  expect(body.webhookUrlSet).toBe(true)
  const raw = JSON.stringify(body)
  expect(raw).not.toContain('https://discord.test/secret')
})

test('POST /api/admin/discord-notifier/test sends a test message to Discord', async () => {
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  const a = await app()
  const res = await a.handle(
    new Request('http://localhost/api/admin/discord-notifier/test/', { method: 'POST' }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as { ok: boolean; status: string }
  expect(body.ok).toBe(true)
  expect(body.status).toBe('sent')
  expect(lastDiscordCall?.url).toBe('https://discord.test/hook')
  const payload = JSON.parse(lastDiscordCall!.body) as { content: string }
  expect(payload.content).toContain('Tabularium discord-notifier test')
})

test('POST /test returns 412 when no webhook URL is configured', async () => {
  const a = await app()
  const res = await a.handle(
    new Request('http://localhost/api/admin/discord-notifier/test/', { method: 'POST' }),
  )
  expect(res.status).toBe(412)
  const body = (await res.json()) as { error: string }
  expect(body.error).toContain('no webhook URL')
})

test('GET /api/admin/discord-notifier/log returns most-recent-first entries', async () => {
  // Pre-populate the log by sending two webhooks.
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  const a = await app()
  await a.handle(new Request('http://localhost/api/admin/discord-notifier/test/', { method: 'POST' }))
  await new Promise((r) => setTimeout(r, 2))
  await a.handle(new Request('http://localhost/api/admin/discord-notifier/test/', { method: 'POST' }))
  const res = await a.handle(new Request('http://localhost/api/admin/discord-notifier/log/?limit=10'))
  expect(res.status).toBe(200)
  const body = (await res.json()) as {
    rows: Array<{ event: string; status: string; sentAt: number }>
    total: number
  }
  expect(body.total).toBeGreaterThanOrEqual(2)
  expect(body.rows.length).toBeGreaterThanOrEqual(2)
  expect(body.rows[0].event).toBe('test')
  expect(body.rows[0].status).toBe('sent')
  if (body.rows.length >= 2) {
    expect(body.rows[0].sentAt).toBeGreaterThanOrEqual(body.rows[1].sentAt)
  }
})
