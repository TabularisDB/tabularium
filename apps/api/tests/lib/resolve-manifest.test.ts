import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { clearDb } from '../helpers'
import { resolveManifest, ManifestValidationError } from '../../src/lib/manifest'
import { parseRepoUrl } from '../../src/lib/providers'

const INVALID_JSON = JSON.stringify({
  name: 'alpha',
  version: 'not-semver',
})

function mockContentsFetch(byPath: Record<string, string>) {
  return spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
    const key = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    const path = key.split('/contents/')[1]?.split('?')[0]
    const body = path !== undefined ? byPath[decodeURIComponent(path)] : undefined
    if (body === undefined) return new Response('not found', { status: 404 })
    return new Response(body, {
      status: 200,
      headers: { 'content-length': String(new TextEncoder().encode(body).length) },
    })
  }) as unknown as typeof fetch)
}

describe('resolveManifest', () => {
  beforeEach(clearDb)

  it('throws ManifestValidationError when a manifest file exists but is invalid', async () => {
    const ref = parseRepoUrl('https://github.com/acme/demo')
    expect(ref).not.toBeNull()
    const spy = mockContentsFetch({ '.tabularium': INVALID_JSON })
    await expect(resolveManifest('test-token', ref!)).rejects.toBeInstanceOf(ManifestValidationError)
    spy.mockRestore()
  })

  it('returns null when no manifest file exists at all', async () => {
    const ref = parseRepoUrl('https://github.com/acme/demo')
    expect(ref).not.toBeNull()
    const spy = mockContentsFetch({})
    expect(await resolveManifest('test-token', ref!)).toBeNull()
    spy.mockRestore()
  })
})
