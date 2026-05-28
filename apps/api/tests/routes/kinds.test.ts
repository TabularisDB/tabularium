import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser } from '../helpers'
import { createKind } from '../../src/lib/kinds'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { auditLog } from '../../src/db/schema'
import { eq } from 'drizzle-orm'

describe('GET /api/kinds (public)', () => {
  beforeEach(clearDb)

  it('returns empty list on fresh install', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/kinds'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as { kinds: unknown[] }
    expect(data.kinds).toEqual([])
  })

  it('returns admin-defined kinds', async () => {
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/kinds'))
    const data = (await res.json()) as { kinds: Array<{ key: string; label: string }> }
    expect(data.kinds).toHaveLength(1)
    expect(data.kinds[0].key).toBe('theme')
  })
})

async function adminToken() {
  const u = await makeUser({ role: 'admin' })
  return signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
}

describe('GET /api/admin/kinds', () => {
  beforeEach(clearDb)

  it('401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/kinds'))
    expect(res.status).toBe(401)
  })

  it('403 for non-admin', async () => {
    const u = await makeUser()
    const token = await signJwt({
      sub: u.id,
      identityId: u.identityId,
      username: u.username,
      providerInstanceId: 'github',
    })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('200 with empty list for admin', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { kinds: unknown[] }
    expect(data.kinds).toEqual([])
  })
})

describe('POST /api/admin/kinds', () => {
  beforeEach(clearDb)

  it('creates a kind, returns 201 + Location header, writes audit', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'theme', label: 'Themes', description: null }),
      }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('Location')).toBe('/api/admin/kinds/theme')
    const data = (await res.json()) as { kind: { key: string } }
    expect(data.kind.key).toBe('theme')
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'kind.create'))
    expect(audits).toHaveLength(1)
    expect(audits[0].meta).toContain('"key":"theme"')
  })

  it('400 on invalid shape', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'Bad Key!', label: 'X' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('409 on duplicate key', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'theme', label: 'Other', description: null }),
      }),
    )
    expect(res.status).toBe(409)
  })

  it('accepts labelTranslations and descriptionTranslations', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'theme',
          label: 'Theme',
          description: 'Visual theme',
          labelTranslations: { de: 'Thema' },
          descriptionTranslations: { de: 'Visuelles Thema' },
        }),
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { kind: Record<string, unknown> }
    expect(body.kind.labelTranslations).toEqual({ de: 'Thema' })
    expect(body.kind.descriptionTranslations).toEqual({ de: 'Visuelles Thema' })
  })

  it('accepts publicPageCopy.heroTranslations and introTranslations', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'theme',
          label: 'Theme',
          description: null,
          publicPageCopy: {
            hero: 'Browse',
            heroTranslations: { de: 'Durchstöbern' },
            intro: 'All themes.',
            introTranslations: { de: 'Alle Themen.' },
          },
        }),
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { kind: { publicPageCopy: Record<string, unknown> } }
    expect(body.kind.publicPageCopy.heroTranslations).toEqual({ de: 'Durchstöbern' })
    expect(body.kind.publicPageCopy.introTranslations).toEqual({ de: 'Alle Themen.' })
  })

  it('rejects unknown locale in labelTranslations', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'theme',
          label: 'Theme',
          description: null,
          labelTranslations: { 'xx-YY': 'bogus' },
        }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST accepts prosePre/prosePost + customExample', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'theme',
          label: 'Theme',
          description: null,
          prosePre: 'before',
          prosePost: 'after',
          customExample: { yaml: 'name: x\nkind: theme\n' },
        }),
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { kind: Record<string, unknown> }
    expect(body.kind.prosePre).toBe('before')
    expect(body.kind.prosePost).toBe('after')
    expect((body.kind.customExample as { yaml: string }).yaml).toBe('name: x\nkind: theme\n')
  })

  it('POST rejects invalid YAML in customExample', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'theme',
          label: 'Theme',
          description: null,
          customExample: { yaml: 'name: : invalid' },
        }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('GET /api/admin/kinds/:key', () => {
  beforeEach(clearDb)

  it('200 with the kind', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds/theme', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { kind: { key: string } }
    expect(data.kind.key).toBe('theme')
  })

  it('404 for unknown key', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds/nope', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/admin/kinds/:key', () => {
  beforeEach(clearDb)

  it('replaces label, writes audit', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'theme', label: 'Visual Themes', description: 'd' }),
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { kind: { label: string } }
    expect(data.kind.label).toBe('Visual Themes')
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'kind.update'))
    expect(audits).toHaveLength(1)
  })

  it('409 when body key mismatches path', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'snippet', label: 'X', description: null }),
      }),
    )
    expect(res.status).toBe(409)
  })

  it('404 for unknown key', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds/nope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'nope', label: 'X', description: null }),
      }),
    )
    expect(res.status).toBe(404)
  })

  it('PUT accepts translation maps', async () => {
    await createKind({ key: 'theme', label: 'Theme', description: null })
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/kinds/theme', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'theme',
          label: 'Theme',
          description: null,
          labelTranslations: { de: 'Thema' },
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kind: Record<string, unknown> }
    expect(body.kind.labelTranslations).toEqual({ de: 'Thema' })
  })
})

describe('DELETE /api/admin/kinds/:key', () => {
  beforeEach(clearDb)

  it('204 + audit, second call 404', async () => {
    const token = await adminToken()
    await createKind({ key: 'theme', label: 'Themes', description: null })
    const app = await buildApp()
    const res1 = await app.handle(
      new Request('http://localhost/api/admin/kinds/theme', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res1.status).toBe(204)
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'kind.delete'))
    expect(audits).toHaveLength(1)
    const res2 = await app.handle(
      new Request('http://localhost/api/admin/kinds/theme', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res2.status).toBe(404)
  })
})
