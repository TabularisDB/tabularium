import { describe, it, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb } from '../helpers'
import { createKind } from '../../src/lib/kinds'

async function post(body: unknown, contentType = 'application/json') {
  const app = await buildApp()
  return app.handle(
    new Request('http://test.local/api/manifest/validate', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

describe('POST /api/manifest/validate', () => {
  beforeEach(clearDb)

  it('returns ok:true for a valid YAML manifest', async () => {
    const res = await post({ text: 'name: My Plugin\nkind: theme\n', source: 'tabularium.yaml' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; normalized?: { name: string } }
    expect(body.ok).toBe(true)
    expect(body.normalized?.name).toBe('My Plugin')
  })

  it('returns ok:false with structured errors for an invalid manifest', async () => {
    const res = await post({ text: 'name: 42\n', source: 'tabularium.yaml' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; errors?: Array<{ path: string; code: string }> }
    expect(body.ok).toBe(false)
    expect(body.errors?.some((e) => e.path === '/name')).toBe(true)
  })

  it('routes through per-kind extensions when kind is given', async () => {
    await createKind({
      key: 'theme',
      label: 'Themes',
      description: null,
      extensionsSchema: { 'x-theme': { type: 'string' } },
    })
    const res = await post({
      text: 'name: X\nkind: theme\nx-theme: light\n',
      source: 'tabularium.yaml',
      kind: 'theme',
    })
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('sniffs source when omitted (JSON body)', async () => {
    const res = await post({ text: '{"name":"X"}' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('returns 400 when text is missing', async () => {
    const res = await post({ source: 'tabularium.yaml' })
    expect(res.status).toBe(400)
  })

  it('returns 413 when text exceeds 64 KiB', async () => {
    const huge = 'name: ' + 'x'.repeat(70_000) + '\n'
    const res = await post({ text: huge, source: 'tabularium.yaml' })
    expect(res.status).toBe(413)
  })
})
