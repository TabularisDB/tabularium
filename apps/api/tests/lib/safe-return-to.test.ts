import { afterEach, expect, test } from 'bun:test'
import { env } from '$lib/env'
import { safeReturnTo } from '../../src/lib/return-to'

const original = env.ALLOWED_ORIGINS

afterEach(() => {
  env.ALLOWED_ORIGINS = original
})

test('keeps same-origin targets as a path', () => {
  expect(safeReturnTo('/requests?x=1#f')).toBe('/requests?x=1#f')
  const webOrigin = new URL(env.WEB_BASE_URL ?? env.BASE_URL).origin
  expect(safeReturnTo(`${webOrigin}/settings`)).toBe('/settings')
})

test('rejects foreign and protocol-relative targets', () => {
  expect(safeReturnTo('https://evil.example/phish')).toBeNull()
  expect(safeReturnTo('//evil.example/phish')).toBeNull()
  expect(safeReturnTo('javascript:alert(1)')).toBeNull()
})

test('returns the full URL for an ALLOWED_ORIGINS site', () => {
  env.ALLOWED_ORIGINS = 'https://tabularis.dev'
  expect(safeReturnTo('https://tabularis.dev/plugins/bounties?request=1')).toBe(
    'https://tabularis.dev/plugins/bounties?request=1',
  )
  expect(safeReturnTo('https://tabularis.dev.evil.example/')).toBeNull()
})

test('GET /auth/return follows trusted URLs and sends anything else home', async () => {
  const { buildApp } = await import('../helpers')
  const { webBaseUrl } = await import('../../src/lib/webhooks/events')
  env.ALLOWED_ORIGINS = 'https://tabularis.dev'
  const app = await buildApp()
  const go = async (to: string) =>
    (await app.handle(new Request(`http://localhost/auth/return?to=${encodeURIComponent(to)}`))).headers.get('location')
  expect(await go('https://tabularis.dev/plugins/bounties?claim=firebird')).toBe(
    'https://tabularis.dev/plugins/bounties?claim=firebird',
  )
  expect(await go('/requests')).toBe(`${webBaseUrl()}/requests`)
  expect(await go('https://evil.example.com/')).toBe(`${webBaseUrl()}/`)
})
