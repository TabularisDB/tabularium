import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { inspectWebhook } from '../../src/lib/inspect-webhook'
import type { RepoRef } from '../../src/lib/providers'

const URL = 'https://registry.example/api/webhooks/release'
const ref: RepoRef = {
  owner: 'owner',
  repo: 'plugin',
  fullName: 'owner/plugin',
  instance: {
    id: 'github',
    kind: 'github',
    baseUrl: 'https://github.com',
    displayName: 'GitHub',
    clientId: '',
    clientSecret: '',
    logoUrl: null,
    enabled: true,
  },
}
const validHook = { id: 1, active: true, events: ['release'], config: { url: URL, content_type: 'json' } }
let fetchSpy: ReturnType<typeof spyOn> | null = null
afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = null
})
function mockRows(rows: unknown) {
  fetchSpy = spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(rows)))
}

describe('inspectWebhook', () => {
  it.each([
    { ...validHook, active: false },
    { ...validHook, events: ['push'] },
    { ...validHook, config: { url: URL, content_type: 'form' } },
  ])('detects an inactive hook, missing releases, or form encoding (%j)', async (hook) => {
    mockRows([hook])
    expect((await inspectWebhook('token', ref, URL)).status).toBe('misconfigured')
  })

  it('accepts all events and finds a valid hook among disabled duplicates', async () => {
    mockRows([
      { ...validHook, active: false },
      { ...validHook, id: 2, events: ['*'] },
    ])
    expect((await inspectWebhook('token', ref, URL)).status).toBe('configured')
  })

  it('checks subsequent pages before reporting a missing hook', async () => {
    fetchSpy = spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, (_, id) => ({ id, config: {} })))))
      .mockResolvedValueOnce(new Response(JSON.stringify([validHook])))
    expect((await inspectWebhook('token', ref, URL)).status).toBe('configured')
    expect(String(fetchSpy.mock.calls[1]![0])).toContain('page=2')
  })

  it('does not mistake a partial list for a missing hook if a later page fails', async () => {
    fetchSpy = spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, (_, id) => ({ id })))))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    expect((await inspectWebhook('token', ref, URL)).status).toBe('unknown')
  })

  it('supports GitHub Enterprise API URLs', async () => {
    mockRows([validHook])
    const enterpriseRef = { ...ref, instance: { ...ref.instance, baseUrl: 'https://git.example' } }
    expect((await inspectWebhook('token', enterpriseRef, URL)).status).toBe('configured')
    expect(String(fetchSpy!.mock.calls[0]![0])).toBe(
      'https://git.example/api/v3/repos/owner/plugin/hooks?per_page=100&page=1',
    )
  })

  it('supports Gitea hooks', async () => {
    mockRows([validHook])
    const giteaRef: RepoRef = { ...ref, instance: { ...ref.instance, kind: 'gitea', baseUrl: 'https://codeberg.org' } }
    expect((await inspectWebhook('token', giteaRef, URL)).status).toBe('configured')
    expect(String(fetchSpy!.mock.calls[0]![0])).toBe(
      'https://codeberg.org/api/v1/repos/owner/plugin/hooks?limit=50&page=1',
    )
  })

  it.each([
    null,
    '2099-01-01T00:00:00Z',
  ])('handles GitLab release hooks and disabled_until=%s', async (disabledUntil) => {
    mockRows([{ id: 1, url: URL, releases_events: true, disabled_until: disabledUntil }])
    const gitlabRef: RepoRef = {
      ...ref,
      owner: 'group/subgroup',
      fullName: 'group/subgroup/plugin',
      instance: { ...ref.instance, kind: 'gitlab', baseUrl: 'https://gitlab.com' },
    }
    expect((await inspectWebhook('token', gitlabRef, URL)).status).toBe(disabledUntil ? 'misconfigured' : 'configured')
    expect(String(fetchSpy!.mock.calls[0]![0])).toContain('/projects/group%2Fsubgroup%2Fplugin/hooks?')
  })

  it('keeps network failures distinct from a missing webhook', async () => {
    fetchSpy = spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await inspectWebhook('token', ref, URL)).toMatchObject({ status: 'unknown', hooks: [] })
  })

  it('handles unexpected provider responses', async () => {
    mockRows({ message: 'invalid' })
    expect((await inspectWebhook('token', ref, URL)).status).toBe('unknown')
  })
})
