import { describe, it, expect, spyOn, afterEach } from 'bun:test'
import { fetchLatestRelease } from '../../src/lib/release-fetch'
import type { RepoRef } from '../../src/lib/providers'
import type { ProviderInstance } from '../../src/lib/provider-instance'

function refFor(kind: ProviderInstance['kind'], baseUrl: string): RepoRef {
  return {
    instance: {
      id: kind,
      kind,
      displayName: kind,
      baseUrl,
      clientId: '',
      clientSecret: '',
      logoUrl: null,
      enabled: true,
    },
    owner: 'alice',
    repo: 'my-plugin',
    fullName: 'alice/my-plugin',
  }
}

const githubRef = refFor('github', 'https://github.com')

function ghRelease(tag: string, extra: Record<string, unknown> = {}) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: tag.includes('-'),
    html_url: `https://github.com/alice/my-plugin/releases/tag/${tag}`,
    assets: [{ name: 'plugin-linux-x64.zip', browser_download_url: `https://example.test/${tag}/linux.zip` }],
    ...extra,
  }
}

let spy: ReturnType<typeof spyOn> | null = null

function mockList(releases: unknown[], status = 200) {
  spy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
    lastUrl = String(url)
    return new Response(JSON.stringify(releases), { status })
  }) as unknown as typeof fetch)
}

let lastUrl = ''

afterEach(() => {
  spy?.mockRestore()
  spy = null
})

describe('fetchLatestRelease (github)', () => {
  // Regression: this used to call /releases/latest, which GitHub defines as
  // the newest NON-prerelease. A plugin shipping only betas 404'd there and
  // looked like it had no releases at all — submit, rehash and the admin
  // replay all silently gave up on it.
  it('finds the newest release when every release is a prerelease', async () => {
    mockList([ghRelease('v1.0.0-beta.5'), ghRelease('v1.0.0-beta.7'), ghRelease('v1.0.0-beta.6')])
    const got = await fetchLatestRelease('token', githubRef)
    expect(got?.tag).toBe('v1.0.0-beta.7')
    expect(lastUrl).toContain('/releases?per_page=100')
    expect(lastUrl).not.toContain('/releases/latest')
  })

  it('ranks by semver, not by the order the provider returns', async () => {
    mockList([ghRelease('v0.2.0'), ghRelease('v0.10.0'), ghRelease('v0.9.0')])
    expect((await fetchLatestRelease('token', githubRef))?.tag).toBe('v0.10.0')
  })

  it('prefers a stable release over its own prerelease', async () => {
    mockList([ghRelease('v2.0.0-rc.1'), ghRelease('v2.0.0')])
    expect((await fetchLatestRelease('token', githubRef))?.tag).toBe('v2.0.0')
  })

  it('picks a newer prerelease over an older stable release', async () => {
    mockList([ghRelease('v1.0.0'), ghRelease('v1.1.0-beta.1')])
    expect((await fetchLatestRelease('token', githubRef))?.tag).toBe('v1.1.0-beta.1')
  })

  it('skips drafts', async () => {
    mockList([ghRelease('v1.0.0'), ghRelease('v2.0.0', { draft: true })])
    expect((await fetchLatestRelease('token', githubRef))?.tag).toBe('v1.0.0')
  })

  it('returns null when the repo has no releases', async () => {
    mockList([])
    expect(await fetchLatestRelease('token', githubRef)).toBeNull()
  })

  it('returns null on 404', async () => {
    mockList({ message: 'Not Found' } as unknown as unknown[], 404)
    expect(await fetchLatestRelease('token', githubRef)).toBeNull()
  })

  it('carries assets from the winning release', async () => {
    mockList([ghRelease('v1.0.0-beta.5'), ghRelease('v1.0.0-beta.7')])
    const got = await fetchLatestRelease('token', githubRef)
    expect(got?.assets[0]?.url).toContain('v1.0.0-beta.7')
    expect(got?.published).toBe(true)
  })
})

describe('fetchLatestRelease (gitlab)', () => {
  const gitlabRef = refFor('gitlab', 'https://gitlab.com')

  it('ranks by semver across the listing', async () => {
    mockList([
      { tag_name: 'v1.0.0-beta.5', assets: { links: [] } },
      { tag_name: 'v1.0.0-beta.7', assets: { links: [] } },
    ])
    expect((await fetchLatestRelease('token', gitlabRef))?.tag).toBe('v1.0.0-beta.7')
  })

  it('returns null on an empty listing', async () => {
    mockList([])
    expect(await fetchLatestRelease('token', gitlabRef)).toBeNull()
  })
})
