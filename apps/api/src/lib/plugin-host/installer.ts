import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { logger } from '$lib/logger'
import { getSetting, hasSetting, setSetting, isSettingsInitialized } from '$lib/settings'

const log = logger.child({ module: 'plugin-installer' })

export type PluginSource = 'workspace' | 'bundled' | 'registry'

export interface InstalledPlugin {
  id: string
  version: string
  source: PluginSource
  entryPoint: string
  installedAt: number
}

const installs = new Map<string, InstalledPlugin>()

// SP1 simulator roots. In dev (bun --hot from apps/api/) cwd is /repo/apps/api,
// so WORKSPACE_ROOT resolves to /repo/packages. In the production image the
// runtime cwd is /app/apps/api and BUNDLED_ROOT lands at /app/bundled-plugins.
let workspaceRoot = resolve(process.cwd(), '..', '..', 'packages')
let bundledRoot = '/app/bundled-plugins'

log.debug(
  { WORKSPACE_ROOT: workspaceRoot, BUNDLED_ROOT: bundledRoot, cwd: process.cwd() },
  'installer roots',
)

/** Test seam: override the workspace + bundled roots for installer tests. */
export function __setInstallerRootsForTests(roots: {
  workspaceRoot?: string
  bundledRoot?: string
}): void {
  if (roots.workspaceRoot !== undefined) workspaceRoot = roots.workspaceRoot
  if (roots.bundledRoot !== undefined) bundledRoot = roots.bundledRoot
}

export function __resetInstallerRootsForTests(): void {
  workspaceRoot = resolve(process.cwd(), '..', '..', 'packages')
  bundledRoot = '/app/bundled-plugins'
}

function workspaceEntry(id: string): { entry: string; pkgJson: string } | null {
  const dir = resolve(workspaceRoot, `plugin-${id}`)
  const entry = resolve(dir, 'src/api/index.ts')
  if (!existsSync(entry)) return null
  return { entry, pkgJson: resolve(dir, 'package.json') }
}

function bundledEntry(id: string): { entry: string; pkgJson: string } | null {
  const dir = resolve(bundledRoot, id)
  const entry = resolve(dir, 'src/api/index.ts')
  if (!existsSync(entry)) return null
  return { entry, pkgJson: resolve(dir, 'package.json') }
}

function readVersion(packageJsonPath: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string }
    return pkg.version ?? null
  } catch {
    return null
  }
}

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotImplementedError'
  }
}

async function installFromRegistry(_id: string): Promise<InstalledPlugin | null> {
  // Future SP5: HTTPS fetch from https://registry.tabularium.wiki/api/plugins/<id>/releases/<version>
  // For now the stub aborts so callers fall through to the warn.
  throw new NotImplementedError('registry source — fetch from registry.tabularium.wiki')
}

/**
 * Ensure a plugin is installed (i.e., its source location is resolved and a
 * record exists in process state + settings). Source preference is
 * workspace > bundled > registry. Returns null when no source can satisfy the
 * id, so the loader can warn-and-skip without throwing.
 */
export async function ensureInstalled(id: string): Promise<InstalledPlugin | null> {
  const cached = installs.get(id)
  if (cached) return cached

  const ws = workspaceEntry(id)
  if (ws) {
    const v = readVersion(ws.pkgJson) ?? '0.0.0'
    return record({
      id,
      version: v,
      source: 'workspace',
      entryPoint: ws.entry,
      installedAt: Date.now(),
    })
  }

  const bd = bundledEntry(id)
  if (bd) {
    const v = readVersion(bd.pkgJson) ?? '0.0.0'
    return record({
      id,
      version: v,
      source: 'bundled',
      entryPoint: bd.entry,
      installedAt: Date.now(),
    })
  }

  try {
    const reg = await installFromRegistry(id)
    if (reg) return reg
  } catch (err) {
    if (err instanceof NotImplementedError) {
      log.warn(
        { id, err: err.message },
        'plugin not found in workspace or bundled-plugins — registry source not implemented',
      )
      return null
    }
    throw err
  }

  log.warn({ id }, 'plugin not found in workspace or bundled-plugins')
  return null
}

async function record(info: InstalledPlugin): Promise<InstalledPlugin> {
  installs.set(info.id, info)
  const settingKey = `plugins.installed.${info.id}`
  const settingVal = JSON.stringify({
    version: info.version,
    source: info.source,
    installedAt: info.installedAt,
  })
  // Settings cache may not be initialized yet during very early boot or in
  // tests that don't seed it; tolerate that quietly.
  if (isSettingsInitialized()) {
    try {
      // Avoid a redundant write if the same record is already persisted.
      if (!hasSetting(settingKey) || getSetting(settingKey) !== settingVal) {
        await setSetting(settingKey, settingVal)
      }
    } catch (err) {
      log.warn({ err, id: info.id }, 'failed to persist install record to settings')
    }
  }
  log.info(
    { id: info.id, version: info.version, source: info.source, entryPoint: info.entryPoint },
    'plugin installed',
  )
  return info
}

export function listInstalled(): InstalledPlugin[] {
  return [...installs.values()]
}

export function getInstalled(id: string): InstalledPlugin | null {
  return installs.get(id) ?? null
}

export function __clearInstallsForTests(): void {
  installs.clear()
}
