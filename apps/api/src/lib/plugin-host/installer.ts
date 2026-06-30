import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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

// Plugin layout differs across the first-party set: plugin-email and
// plugin-discord-notifier use src/api/index.ts, while plugin-smtp and
// plugin-turbosmtp use src/index.ts directly. Walk the candidates plus the
// package.json `main` field so both layouts resolve.
const ENTRY_CANDIDATES = ['src/api/index.ts', 'src/index.ts']

function readMainField(pkgJsonPath: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { main?: string; module?: string }
    return pkg.main ?? pkg.module ?? null
  } catch {
    return null
  }
}

function resolveEntryIn(dir: string): { entry: string; pkgJson: string } | null {
  const pkgJson = resolve(dir, 'package.json')
  const main = existsSync(pkgJson) ? readMainField(pkgJson) : null
  if (main) {
    const fromMain = resolve(dir, main)
    if (existsSync(fromMain)) return { entry: fromMain, pkgJson }
  }
  for (const candidate of ENTRY_CANDIDATES) {
    const entry = resolve(dir, candidate)
    if (existsSync(entry)) return { entry, pkgJson }
  }
  return null
}

function workspaceEntry(id: string): { entry: string; pkgJson: string } | null {
  return resolveEntryIn(resolve(workspaceRoot, `plugin-${id}`))
}

function bundledEntry(id: string): { entry: string; pkgJson: string } | null {
  return resolveEntryIn(resolve(bundledRoot, id))
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

/**
 * Walk up from a plugin entry-point file until we find a sibling `package.json`,
 * then return that directory. Used to anchor docs/README probing without
 * encoding the workspace vs bundled layout difference at the call site.
 *
 * Returns null when no package.json shows up before the filesystem root —
 * defensive case that shouldn't fire for real installs since the installer
 * resolved the entry through a package.json in the first place.
 */
export function pluginPackageDir(entryPoint: string): string | null {
  let current = dirname(entryPoint)
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(current, 'package.json'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

/**
 * Read the localized README for an installed plugin.
 *
 * Looks for `<pkgDir>/docs/README.<locale>.md`; falls back to `README.en.md`
 * if the requested locale doesn't exist; returns null when neither does.
 * Plugin authors get the convention from the docs alongside `requires` /
 * `contributions`; the kernel never demands a README, but the admin plugins
 * page renders this string into the details modal when it's present.
 */
export function readPluginReadme(entryPoint: string, locale: string): string | null {
  const pkgDir = pluginPackageDir(entryPoint)
  if (!pkgDir) return null
  const candidates = [resolve(pkgDir, 'docs', `README.${locale}.md`)]
  // Always fall back to en — keeps the modal non-empty when an admin runs in
  // a locale the plugin author hasn't translated yet.
  if (locale !== 'en') candidates.push(resolve(pkgDir, 'docs', 'README.en.md'))
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      return readFileSync(path, 'utf8')
    } catch {
      // unreadable — try next candidate
    }
  }
  return null
}

export interface AvailableProbe {
  id: string
  version: string | null
  source: 'workspace' | 'bundled' | null
  description: string | null
  entryPoint: string | null
}

function readDescription(packageJsonPath: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { description?: string }
    return pkg.description ?? null
  } catch {
    return null
  }
}

/**
 * Probe a known plugin id for its package metadata WITHOUT touching the
 * installer's persistent record. Used by the admin plugins page to surface
 * "Available" plugins (workspace/bundled but never installed) so the operator
 * can see version + description before clicking Install.
 *
 * Returns nulls in every field when no source resolves so the caller can still
 * render the row with at-least-the-id.
 */
export function probeAvailable(id: string): AvailableProbe {
  const ws = workspaceEntry(id)
  if (ws) {
    return {
      id,
      version: readVersion(ws.pkgJson),
      source: 'workspace',
      description: readDescription(ws.pkgJson),
      entryPoint: ws.entry,
    }
  }
  const bd = bundledEntry(id)
  if (bd) {
    return {
      id,
      version: readVersion(bd.pkgJson),
      source: 'bundled',
      description: readDescription(bd.pkgJson),
      entryPoint: bd.entry,
    }
  }
  return { id, version: null, source: null, description: null, entryPoint: null }
}

export function getInstalled(id: string): InstalledPlugin | null {
  return installs.get(id) ?? null
}

/**
 * Drop the in-process install record for a plugin. The persisted
 * `plugins.installed.<id>` setting is the caller's responsibility — this
 * function only touches the in-memory `installs` map.
 *
 * Returns true when a record was actually removed. Used by the admin uninstall
 * endpoint so the GET /api/admin/infra/plugins listing reflects the deletion
 * immediately rather than waiting for next boot.
 */
export function deleteInstalled(id: string): boolean {
  return installs.delete(id)
}

export function __clearInstallsForTests(): void {
  installs.clear()
}
