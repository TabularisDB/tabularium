import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureInstalled,
  listInstalled,
  __clearInstallsForTests,
  __setInstallerRootsForTests,
  __resetInstallerRootsForTests,
} from '../../../src/lib/plugin-host/installer'
import { initSettings, getSetting, deleteSetting } from '../../../src/lib/settings'
import { clearDb } from '../../helpers'

let tmpWorkspace: string
let tmpBundled: string

function seedWorkspacePlugin(id: string, version: string): void {
  const dir = join(tmpWorkspace, `plugin-${id}`)
  mkdirSync(join(dir, 'src/api'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@tabularium/plugin-${id}`, version }))
  writeFileSync(join(dir, 'src/api/index.ts'), 'export default {}\n')
}

function seedBundledPlugin(id: string, version: string): void {
  const dir = join(tmpBundled, id)
  mkdirSync(join(dir, 'src/api'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@tabularium/plugin-${id}`, version }))
  writeFileSync(join(dir, 'src/api/index.ts'), 'export default {}\n')
}

beforeEach(async () => {
  await clearDb()
  await initSettings()
  __clearInstallsForTests()
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'tab-installer-ws-'))
  tmpBundled = mkdtempSync(join(tmpdir(), 'tab-installer-bd-'))
  __setInstallerRootsForTests({ workspaceRoot: tmpWorkspace, bundledRoot: tmpBundled })
})

afterEach(async () => {
  __clearInstallsForTests()
  rmSync(tmpWorkspace, { recursive: true, force: true })
  rmSync(tmpBundled, { recursive: true, force: true })
  __resetInstallerRootsForTests()
  await deleteSetting('plugins.installed.alpha')
  await deleteSetting('plugins.installed.beta')
  await deleteSetting('plugins.installed.gamma')
})

test('workspace source returns the workspace entry path when src/api/index.ts exists', async () => {
  seedWorkspacePlugin('alpha', '2.3.4')
  const info = await ensureInstalled('alpha')
  expect(info).not.toBeNull()
  expect(info!.id).toBe('alpha')
  expect(info!.source).toBe('workspace')
  expect(info!.version).toBe('2.3.4')
  expect(info!.entryPoint).toBe(join(tmpWorkspace, 'plugin-alpha/src/api/index.ts'))
})

test('bundled source is used when workspace misses but bundled-plugins has the id', async () => {
  seedBundledPlugin('beta', '0.9.1')
  const info = await ensureInstalled('beta')
  expect(info).not.toBeNull()
  expect(info!.source).toBe('bundled')
  expect(info!.version).toBe('0.9.1')
  expect(info!.entryPoint).toBe(join(tmpBundled, 'beta/src/api/index.ts'))
})

test('workspace wins over bundled when both exist', async () => {
  seedWorkspacePlugin('alpha', '1.0.0')
  seedBundledPlugin('alpha', '9.9.9')
  const info = await ensureInstalled('alpha')
  expect(info!.source).toBe('workspace')
  expect(info!.version).toBe('1.0.0')
})

test('returns null when no source can satisfy the id (registry stubbed)', async () => {
  const info = await ensureInstalled('gamma')
  expect(info).toBeNull()
})

test('install record is cached and only one settings write per plugin', async () => {
  seedWorkspacePlugin('alpha', '1.0.0')
  const a = await ensureInstalled('alpha')
  const b = await ensureInstalled('alpha')
  expect(a).toBe(b) // identity — cached, not re-resolved
  expect(listInstalled()).toHaveLength(1)

  const persisted = getSetting('plugins.installed.alpha')
  expect(persisted).toBeDefined()
  const parsed = JSON.parse(persisted!) as { version: string; source: string }
  expect(parsed.version).toBe('1.0.0')
  expect(parsed.source).toBe('workspace')
})
