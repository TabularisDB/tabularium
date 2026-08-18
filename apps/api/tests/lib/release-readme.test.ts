import { describe, it, expect, spyOn, afterEach, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { resolveManifestFromReleaseAssets } from '../../src/lib/manifest'
import { manifestPatch, readmePayloadOf } from '../../src/lib/manifest-apply'
import type { RepoRef } from '../../src/lib/providers'

const MANIFEST = JSON.stringify({ name: 'alpha', version: '1.0.0', description: 'A test plugin.' })

const ref: RepoRef = {
  instance: {
    id: 'github',
    kind: 'github',
    displayName: 'GitHub',
    baseUrl: 'https://github.com',
    clientId: '',
    clientSecret: '',
    logoUrl: null,
    enabled: true,
  },
  owner: 'alice',
  repo: 'my-plugin',
  fullName: 'alice/my-plugin',
}

let spy: ReturnType<typeof spyOn> | null = null
let requested: string[] = []

function mockFetch(byUrlContains: Array<[string, string]>) {
  requested = []
  spy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
    const key = String(typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url)
    requested.push(key)
    const hit = byUrlContains.find(([needle]) => key.includes(needle))
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(hit[1], {
      status: 200,
      headers: { 'content-length': String(new TextEncoder().encode(hit[1]).length) },
    })
  }) as unknown as typeof fetch)
}

afterEach(() => {
  spy?.mockRestore()
  spy = null
})

describe('resolveManifestFromReleaseAssets — README capture', () => {
  beforeEach(clearDb)

  // Regression: the asset path used to return readme: null unconditionally, so
  // every asset-resolved release stored a blank README — and the patch then
  // wrote that null over whatever the plugin already had.
  it('reads the README at the release tag when told where to look', async () => {
    mockFetch([
      ['/default.tabularium', MANIFEST],
      ['contents/README.md', '# Alpha\n\nDocs at this tag.'],
    ])
    const got = await resolveManifestFromReleaseAssets(
      'token',
      [{ name: 'default.tabularium', url: 'https://example.com/default.tabularium' }],
      { ref, tag: 'v1.0.0' },
    )
    expect(got?.readmeMarkdown).toContain('Docs at this tag')
    // pinned to the tag, not to a branch head
    expect(requested.some((u) => u.includes('contents/README.md') && u.includes('ref=v1.0.0'))).toBe(true)
  })

  it('leaves the README null when the caller gives no tag', async () => {
    mockFetch([['/default.tabularium', MANIFEST]])
    const got = await resolveManifestFromReleaseAssets('token', [
      { name: 'default.tabularium', url: 'https://example.com/default.tabularium' },
    ])
    expect(got?.parsed.name).toBe('alpha')
    expect(got?.readmeMarkdown).toBeNull()
  })

  it('prefers the localized readmes map over the root fallback', async () => {
    const withLocales = JSON.stringify({
      name: 'alpha',
      version: '1.0.0',
      readmes: { en: 'docs/en.md', de: 'docs/de.md' },
    })
    mockFetch([
      ['/default.tabularium', withLocales],
      ['docs%2Fen.md', '# English'],
      ['docs%2Fde.md', '# Deutsch'],
    ])
    const got = await resolveManifestFromReleaseAssets(
      'token',
      [{ name: 'default.tabularium', url: 'https://example.com/default.tabularium' }],
      { ref, tag: 'v1.0.0' },
    )
    expect(got?.readmeLocales?.en).toContain('English')
    expect(got?.readmeLocales?.de).toContain('Deutsch')
    expect(readmePayloadOf(got!)).toContain('"de"')
  })
})

describe('manifestPatch — README is never blanked', () => {
  const base = { raw: MANIFEST, parsed: JSON.parse(MANIFEST) }

  it('omits readme entirely when this pass resolved none', () => {
    const patch = manifestPatch(
      { ...base, readmeMarkdown: null, readmeLocales: null },
      {
        repoBase: 'https://raw.example/',
        version: '1.0.0',
      },
    )
    // absent, not null — an explicit null would overwrite the stored README
    expect('readme' in patch).toBe(false)
  })

  it('sets readme when one was resolved', () => {
    const patch = manifestPatch(
      { ...base, readmeMarkdown: '# Hi', readmeLocales: null },
      {
        repoBase: 'https://raw.example/',
        version: '1.0.0',
      },
    )
    expect(patch.readme).toBe('# Hi')
  })

  it('stores a locale map as JSON', () => {
    const patch = manifestPatch(
      { ...base, readmeMarkdown: null, readmeLocales: { en: '# Hi' } },
      {
        repoBase: 'https://raw.example/',
        version: '1.0.0',
      },
    )
    expect(JSON.parse(patch.readme as string)).toEqual({ en: '# Hi' })
  })
})
