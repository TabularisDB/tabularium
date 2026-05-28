import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { createKind, deleteKind } from '../../src/lib/kinds'

describe('GET /api/docs/plugin-development', () => {
  beforeEach(clearDb)

  it('returns the docs shape with default locale (no auth required)', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/docs/plugin-development'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toHaveProperty('coreFields')
    expect(body).toHaveProperty('kinds')
    expect(body).toHaveProperty('examples')
    expect(body).toHaveProperty('apiReference')
    expect(body).toHaveProperty('customSections')
    expect(body).toHaveProperty('intro')
    expect(body).toHaveProperty('outro')
  })

  it('honours ?locale=de for kind translations', async () => {
    await createKind({
      key: 'theme',
      label: 'Theme',
      description: null,
      labelTranslations: { de: 'Thema' },
    })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/docs/plugin-development?locale=de'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kinds: Array<{ key: string; label: string }> }
    const theme = body.kinds.find((k) => k.key === 'theme')
    expect(theme?.label).toBe('Thema')
    await deleteKind('theme')
  })

  it('falls back gracefully for unsupported locale param', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/docs/plugin-development?locale=xx-YY'))
    expect(res.status).toBe(200)
  })

  it('sets cache-control: no-store', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/docs/plugin-development'))
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
