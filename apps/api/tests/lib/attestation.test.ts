import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { fetchAttestation } from '../../src/lib/attestation'

let server: ReturnType<typeof Bun.serve>
const BUNDLE = {
  mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3',
  verificationMaterial: {},
}

describe('fetchAttestation (GitHub relay)', () => {
  beforeEach(() => {
    server = Bun.serve({
      port: 0,
      fetch: (req) => {
        const u = new URL(req.url)
        if (u.pathname === '/repos/alice/p/attestations/sha256:deadbeef') {
          return Response.json({ attestations: [BUNDLE] })
        }
        return new Response('', { status: 404 })
      },
    })
  })
  afterEach(() => server.stop(true))

  it('returns the bundle JSON on 200', async () => {
    const bundle = await fetchAttestation({
      apiBase: `http://localhost:${server.port}`,
      owner: 'alice',
      repo: 'p',
      sha256: 'deadbeef',
      token: 't',
    })
    expect(bundle).toBeTruthy()
    expect(bundle).toEqual({ attestations: [BUNDLE] })
  })

  it('returns null on 404', async () => {
    const bundle = await fetchAttestation({
      apiBase: `http://localhost:${server.port}`,
      owner: 'alice',
      repo: 'missing',
      sha256: 'deadbeef',
      token: 't',
    })
    expect(bundle).toBeNull()
  })

  it('throws on other non-OK status', async () => {
    const failingServer = Bun.serve({
      port: 0,
      fetch: () => new Response('boom', { status: 500 }),
    })
    try {
      await expect(
        fetchAttestation({
          apiBase: `http://localhost:${failingServer.port}`,
          owner: 'alice',
          repo: 'p',
          sha256: 'deadbeef',
          token: 't',
        }),
      ).rejects.toThrow(/500/)
    } finally {
      failingServer.stop(true)
    }
  })
})
