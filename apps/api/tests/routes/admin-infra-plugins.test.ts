import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp, clearDb, makeAdmin, adminHeaders } from '../helpers'
import { getSetting, hasSetting, setSetting } from '../../src/lib/settings'
import {
  __clearInstallsForTests,
  __setInstallerRootsForTests,
  __resetInstallerRootsForTests,
  ensureInstalled,
  getInstalled,
} from '../../src/lib/plugin-host/installer'

let tmpWorkspace: string
let tmpBundled: string

function seedWorkspacePlugin(id: string, version: string): void {
  const dir = join(tmpWorkspace, `plugin-${id}`)
  mkdirSync(join(dir, 'src/api'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@tabularium/plugin-${id}`, version }))
  writeFileSync(join(dir, 'src/api/index.ts'), 'export default {}\n')
}

describe('admin /api/admin/infra/plugins', () => {
  beforeEach(async () => {
    await clearDb()
    __clearInstallsForTests()
    tmpWorkspace = mkdtempSync(join(tmpdir(), 'tab-infra-plugins-ws-'))
    tmpBundled = mkdtempSync(join(tmpdir(), 'tab-infra-plugins-bd-'))
    __setInstallerRootsForTests({ workspaceRoot: tmpWorkspace, bundledRoot: tmpBundled })
  })

  afterEach(() => {
    __clearInstallsForTests()
    rmSync(tmpWorkspace, { recursive: true, force: true })
    rmSync(tmpBundled, { recursive: true, force: true })
    __resetInstallerRootsForTests()
  })

  it('POST / installs a workspace plugin and adds it to infra.plugins.enabled', async () => {
    seedWorkspacePlugin('alpha', '1.2.3')
    const admin = await makeAdmin()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/infra/plugins/', {
        method: 'POST',
        headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'alpha' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; id: string; source: string; version: string; enabled: boolean }
    expect(body).toMatchObject({ ok: true, id: 'alpha', source: 'workspace', version: '1.2.3', enabled: true })
    const enabled = JSON.parse(getSetting('infra.plugins.enabled') ?? '[]') as string[]
    expect(enabled).toContain('alpha')
    expect(hasSetting('plugins.installed.alpha')).toBe(true)
  })

  it('POST / returns 404 when the id is known but missing on disk', async () => {
    // listKnownPluginIds() includes 'email' but we point the workspace root at
    // an empty temp dir, so resolution fails. Expect a workspace/bundled 404.
    const admin = await makeAdmin()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/infra/plugins/', {
        method: 'POST',
        headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'email' }),
      }),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('not found in workspace or bundled-plugins')
  })

  it('POST / returns 501 when the id is unknown (registry path stubbed)', async () => {
    const admin = await makeAdmin()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/infra/plugins/', {
        method: 'POST',
        headers: { ...adminHeaders(admin), 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'no-such-plugin' }),
      }),
    )
    expect(res.status).toBe(501)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('registry')
  })

  it('DELETE /:id drops the install record and clears the enabled flag', async () => {
    seedWorkspacePlugin('alpha', '1.0.0')
    await ensureInstalled('alpha')
    await setSetting('infra.plugins.enabled', JSON.stringify(['alpha', 'beta']))
    expect(getInstalled('alpha')).not.toBeNull()
    expect(hasSetting('plugins.installed.alpha')).toBe(true)

    const admin = await makeAdmin()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/infra/plugins/alpha', {
        method: 'DELETE',
        headers: adminHeaders(admin),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; removedFromEnabled: boolean }
    expect(body).toEqual({ ok: true, id: 'alpha', removedFromEnabled: true } as never)
    expect(getInstalled('alpha')).toBeNull()
    expect(hasSetting('plugins.installed.alpha')).toBe(false)
    const enabled = JSON.parse(getSetting('infra.plugins.enabled') ?? '[]') as string[]
    expect(enabled).not.toContain('alpha')
    expect(enabled).toContain('beta')
  })

  it('DELETE /:id returns 404 when the plugin is not installed', async () => {
    const admin = await makeAdmin()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/infra/plugins/ghost', {
        method: 'DELETE',
        headers: adminHeaders(admin),
      }),
    )
    expect(res.status).toBe(404)
  })

  it('PUT /:id/disable returns 409 when the plugin is operator-required', async () => {
    seedWorkspacePlugin('alpha', '1.0.0')
    await ensureInstalled('alpha')
    await setSetting('infra.plugins.required', JSON.stringify(['alpha']))
    // The required-set is read at boot in listRequiredPlugins via the loader's
    // requiredSet. Re-init plugins so the change takes effect.
    const { initPlugins, __clearLoadedForTests } = await import('../../src/lib/plugin-host')
    __clearLoadedForTests()
    await initPlugins()

    const admin = await makeAdmin()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/infra/plugins/alpha/disable', {
        method: 'PUT',
        headers: adminHeaders(admin),
      }),
    )
    expect(res.status).toBe(409)
  })
})
