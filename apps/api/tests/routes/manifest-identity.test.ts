import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { buildApp, clearDb, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { manifestPatch } from '../../src/lib/manifest-apply'
import { parseManifestText } from '../../src/lib/manifest'
import { setSetting } from '../../src/lib/settings'

let fetchSpy: ReturnType<typeof spyOn> | undefined
afterEach(() => fetchSpy?.mockRestore())
beforeEach(clearDb)

describe('manifest identity migration', () => {
  for (const modern of [false, true]) {
    it(`preview and submit agree on identity (modern=${modern})`, async () => {
      const user = await makeUser({ username: 'alice' })
      const token = await signJwt({
        sub: user.id,
        identityId: user.identityId,
        username: 'alice',
        providerInstanceId: 'github',
      })
      const name = modern ? 'SQLite JDBC' : 'jdbc-sqlite'
      const manifest = { ...(modern ? { id: 'jdbc-sqlite' } : {}), name, version: '1.0.0' }
      fetchSpy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
        const u = String(url)
        if (u.includes('/releases?')) return Response.json([{ tag_name: 'v1.0.0', assets: [] }])
        if (u.includes('/contents/.tabularium')) return Response.json(manifest)
        if (u.endsWith('/repos/alice/example'))
          return Response.json({ owner: { login: 'alice' }, permissions: { maintain: true } })
        if (u.includes('/hooks')) return Response.json({ id: 1 }, { status: 201 })
        return new Response('not found', { status: 404 })
      }) as typeof fetch)
      const app = await buildApp()
      for (const route of ['preview', 'oauth']) {
        const res = await app.handle(
          new Request(`http://localhost/api/submit/${route}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoUrl: 'https://github.com/alice/example' }),
          }),
        )
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ slug: 'jdbc-sqlite' })
      }
      expect(await db.query.plugins.findFirst({ where: { id: 'jdbc-sqlite' } })).toMatchObject({
        name,
        latestVersion: '1.0.0',
      })
    })
  }

  it('guards all metadata application paths while preserving pinned legacy slugs', () => {
    const manifest = {
      raw: '',
      parsed: { id: 'alpha', name: 'Alpha Driver', version: '1.0.0' },
      readmeMarkdown: null,
      readmeLocales: null,
    }
    const options = { pluginId: 'alpha', repoBase: '', version: '1.0.0' }
    expect(manifestPatch(manifest, options).name).toBe('Alpha Driver')
    expect(() => manifestPatch(manifest, { ...options, pluginId: 'beta' })).toThrow('does not match')
    expect(manifestPatch({ ...manifest, parsed: { name: 'old-display-slug', version: '1.0.0' } }, options).name).toBe(
      'old-display-slug',
    )
  })

  it('loads persisted id extensions without losing other driver metadata', async () => {
    await setSetting(
      'manifest.extensions_schema',
      JSON.stringify({
        id: { type: 'string', required: true, pattern: '^old-only$' },
        engine: { type: 'string' },
      }),
    )
    expect(
      parseManifestText(JSON.stringify({ id: 'jdbc-sqlite', name: 'SQLite JDBC', version: '1.0.0', engine: 'sqlite' })),
    ).toMatchObject({ id: 'jdbc-sqlite', name: 'SQLite JDBC', engine: 'sqlite' })
    expect(parseManifestText(JSON.stringify({ name: 'jdbc-sqlite', version: '1.0.0' })).name).toBe('jdbc-sqlite')
  })
})
