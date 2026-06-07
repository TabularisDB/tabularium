import { afterEach, beforeEach, expect, test } from 'bun:test'
import { desc } from 'drizzle-orm'
import { makeStubHost, type StubHostHandle } from './_stubs'
import { setHost, __resetHostForTests } from '../src/api/host-handles'
import { sendDiscordWebhook } from '../src/api/webhook'
import { webhookLog } from '../src/api/schema'

let stub: StubHostHandle
let realFetch: typeof fetch
let fetchCalls: Array<{ url: string; body: unknown }>

beforeEach(() => {
  __resetHostForTests()
  stub = makeStubHost()
  setHost(stub.host)
  realFetch = globalThis.fetch
  fetchCalls = []
})

afterEach(() => {
  globalThis.fetch = realFetch
  stub.reset()
  __resetHostForTests()
})

function installFetch(handler: (url: string, init: RequestInit) => Promise<Response>): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const i = init ?? {}
    fetchCalls.push({ url, body: i.body })
    return handler(url, i)
  }) as typeof fetch
}

test('skips with no webhook URL configured and logs a "skipped" row', async () => {
  installFetch(async () => new Response('should not run', { status: 200 }))
  const out = await sendDiscordWebhook({ content: 'hi' }, 'plugin.approved')
  expect(out.status).toBe('skipped')
  expect(fetchCalls).toHaveLength(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (stub.db as any).select().from(webhookLog).all()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ event: 'plugin.approved', status: 'skipped', error: 'no webhook URL configured' })
})

test('skips when the event is not in enabled_events', async () => {
  installFetch(async () => new Response('', { status: 204 }))
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  await stub.host.settings.set('discord-notifier.enabled_events', JSON.stringify(['plugin.approved']))
  const out = await sendDiscordWebhook({ content: 'hi' }, 'account.welcome')
  expect(out.status).toBe('skipped')
  expect(fetchCalls).toHaveLength(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (stub.db as any).select().from(webhookLog).all()
  expect(rows.some((r: { status: string; error: string | null }) => r.status === 'skipped' && r.error === 'event disabled in settings')).toBe(true)
})

test('sends successfully and writes a "sent" row with the http status', async () => {
  installFetch(async () => new Response('', { status: 204 }))
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  const out = await sendDiscordWebhook({ content: 'hello' }, 'plugin.approved')
  expect(out.status).toBe('sent')
  expect(out.httpStatus).toBe(204)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url).toBe('https://discord.test/hook')
  const payload = JSON.parse(fetchCalls[0].body as string)
  expect(payload.content).toBe('hello')
  expect(payload.username).toBe('Tabularium')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (stub.db as any).select().from(webhookLog).orderBy(desc(webhookLog.sentAt)).all()
  expect(rows[0]).toMatchObject({ event: 'plugin.approved', status: 'sent', httpStatus: 204 })
})

test('uses configured username override when present', async () => {
  installFetch(async () => new Response('', { status: 204 }))
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  await stub.host.settings.set('discord-notifier.username', 'Tabularium-Bot')
  await sendDiscordWebhook({ content: 'hello' }, 'plugin.approved')
  const payload = JSON.parse(fetchCalls[0].body as string)
  expect(payload.username).toBe('Tabularium-Bot')
})

test('records a "failed" row when Discord responds with non-2xx', async () => {
  installFetch(async () => new Response('rate limited', { status: 429 }))
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  const out = await sendDiscordWebhook({ content: 'hello' }, 'plugin.approved')
  expect(out.status).toBe('failed')
  expect(out.httpStatus).toBe(429)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (stub.db as any).select().from(webhookLog).orderBy(desc(webhookLog.sentAt)).all()
  expect(rows[0]).toMatchObject({ status: 'failed', httpStatus: 429 })
  expect(rows[0].error).toContain('rate limited')
})

test('records a "failed" row when fetch throws (network down)', async () => {
  installFetch(async () => {
    throw new Error('econnrefused')
  })
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  const out = await sendDiscordWebhook({ content: 'hello' }, 'plugin.approved')
  expect(out.status).toBe('failed')
  expect(out.error).toContain('econnrefused')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (stub.db as any).select().from(webhookLog).orderBy(desc(webhookLog.sentAt)).all()
  expect(rows[0]).toMatchObject({ status: 'failed', httpStatus: null })
})

test('the synthetic "test" event bypasses enabled_events gating', async () => {
  installFetch(async () => new Response('', { status: 204 }))
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://discord.test/hook', { encrypted: true })
  await stub.host.settings.set('discord-notifier.enabled_events', JSON.stringify([]))
  const out = await sendDiscordWebhook({ content: 'test message' }, 'test')
  expect(out.status).toBe('sent')
  expect(fetchCalls).toHaveLength(1)
})

test('encrypted opts flag is recorded on settings.set for webhook_url', async () => {
  // Tests the stub itself — guards us against regressions where a future
  // settings.ts handler forgets to pass { encrypted: true } when writing the
  // credential. The real PUT route is verified in routes.test.ts.
  await stub.host.settings.set('discord-notifier.webhook_url', 'https://x', { encrypted: true })
  expect(stub.settings.get('discord-notifier.webhook_url')).toEqual({ value: 'https://x', encrypted: true })
})
