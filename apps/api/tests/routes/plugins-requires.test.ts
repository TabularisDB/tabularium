import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'

describe('GET /api/plugins/:slug — requires surface', () => {
  beforeEach(clearDb)

  it('returns parsed requires entries on the detail endpoint', async () => {
    const u = await makeUser()
    await makePlugin(u.id, {
      id: 'midnight-theme',
      requires: JSON.stringify([
        { id: 'theme-engine', version: '^2.0.0' },
        { id: 'analytics', optional: true, reason: 'telemetry' },
      ]),
    })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/midnight-theme'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      requires: Array<{ id: string; version?: string; optional?: boolean; reason?: string }>
    }
    expect(data.requires).toHaveLength(2)
    expect(data.requires[0]).toEqual({ id: 'theme-engine', version: '^2.0.0' })
    expect(data.requires[1]).toEqual({ id: 'analytics', optional: true, reason: 'telemetry' })
  })

  it('returns an empty array when the plugin has no requires column', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'standalone' })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/standalone'))
    const data = (await res.json()) as { requires: unknown }
    expect(Array.isArray(data.requires)).toBe(true)
    expect((data.requires as unknown[]).length).toBe(0)
  })

  it('drops malformed entries when parsing the column', async () => {
    const u = await makeUser()
    await makePlugin(u.id, {
      id: 'malformed',
      // Mix of valid + invalid; only `theme-engine` should survive.
      requires: JSON.stringify([{ id: 'theme-engine' }, { missing: 'id' }, 'string', 42, null]),
    })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/malformed'))
    const data = (await res.json()) as { requires: Array<{ id: string }> }
    expect(data.requires).toHaveLength(1)
    expect(data.requires[0].id).toBe('theme-engine')
  })
})
