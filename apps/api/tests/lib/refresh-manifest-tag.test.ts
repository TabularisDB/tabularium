import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { clearDb, makeUser, makePlugin } from '../helpers'
import { db } from '../../src/db'
import { refreshManifestForPlugin } from '../../src/lib/refresh-manifest'

const SAMPLE_JSON = JSON.stringify({
  name: 'alpha',
  version: '1.0.0',
  description: 'A test plugin.',
  category: 'misc',
  icon: 'https://example.com/icon.svg',
})

// latestVersion is the bare semver ("1.0.0") but the git tag is v-prefixed
// ("v1.0.0") — the refresh must fall back to the v-prefixed ref.
describe('refreshManifestForPlugin tag fallback', () => {
  beforeEach(clearDb)

  it('falls back to v-prefixed tag when the bare version ref 404s', async () => {
    const u = await makeUser()
    const plugin = await makePlugin(u.id, { id: 'alpha', latestVersion: '1.0.0' })
    const spy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
      const key = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (key.includes('contents/.tabularium') && key.includes('ref=v1.0.0')) {
        return new Response(SAMPLE_JSON, { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch)

    const result = await refreshManifestForPlugin(plugin, {})
    expect(result).toEqual({ ok: true, slug: 'alpha', ref: 'v1.0.0' })
    const row = await db.query.plugins.findFirst({ where: { id: 'alpha' } })
    expect(row?.iconUrl).toBe('https://example.com/icon.svg')
    spy.mockRestore()
  })

  it('still 404s with both tried refs in the message when neither exists', async () => {
    const u = await makeUser()
    const plugin = await makePlugin(u.id, { id: 'alpha', latestVersion: '1.0.0' })
    const spy = spyOn(global, 'fetch').mockImplementation(
      (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch,
    )

    const result = await refreshManifestForPlugin(plugin, {})
    expect(result).toMatchObject({ status: 404 })
    expect((result as { body: { error: string } }).body.error).toContain('1.0.0 or v1.0.0')
    spy.mockRestore()
  })
})
