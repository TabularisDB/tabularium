import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

// Plugin kinds @tabularis/create-plugin can scaffold.
export const SCAFFOLD_KINDS = ['driver', 'theme'] as const
export type ScaffoldKind = (typeof SCAFFOLD_KINDS)[number]

export function isScaffoldKind(v: string | null | undefined): v is ScaffoldKind {
  return !!v && (SCAFFOLD_KINDS as readonly string[]).includes(v)
}

export type DriverOptions = {
  dbType: 'network' | 'file' | 'folder' | 'api'
  quote: '"' | '`'
  withUi: boolean
}

export type ScaffoldInput =
  | { kind: 'driver'; slug: string; driver: DriverOptions }
  | { kind: 'theme'; slug: string; minRuntimeVersion: string }

export type ScaffoldFile = { path: string; content: Buffer; executable: boolean }

export class ScaffoldError extends Error {}

// Same rule the scaffolder enforces on plugin names.
export const SCAFFOLD_SLUG_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/

function packageDir(): string {
  const require = createRequire(import.meta.url)
  return dirname(require.resolve('@tabularis/create-plugin/package.json'))
}

async function walk(root: string, dir = root): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(root, full)))
    else if (entry.isFile()) out.push(relative(root, full))
  }
  return out
}

function cliArgs(input: ScaffoldInput, target: string): string[] {
  const dist = join(packageDir(), 'dist')
  if (input.kind === 'theme') {
    return [
      join(dist, 'theme.js'),
      'scaffold',
      input.slug,
      '--dir',
      target,
      '--min-runtime-version',
      input.minRuntimeVersion,
    ]
  }
  const args = [
    join(dist, 'cli.js'),
    input.slug,
    '--no-git',
    '--dir',
    target,
    '--db-type',
    input.driver.dbType,
    '--quote',
    input.driver.quote,
  ]
  if (input.driver.withUi) args.push('--with-ui')
  return args
}

/**
 * Generate a plugin project with the published @tabularis/create-plugin CLI
 * (the same templates `npm create @tabularis/plugin` uses) and return its
 * files. The CLI writes to disk, so it runs in a throwaway directory.
 */
export async function generatePluginFiles(input: ScaffoldInput): Promise<ScaffoldFile[]> {
  if (!SCAFFOLD_SLUG_RE.test(input.slug)) {
    throw new ScaffoldError(`'${input.slug}' is not a valid plugin name for the scaffolder.`)
  }
  const work = await mkdtemp(join(tmpdir(), 'tabularium-scaffold-'))
  const target = join(work, 'plugin')
  try {
    const proc = Bun.spawn([process.execPath, ...cliArgs(input, target)], {
      cwd: work,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PATH: process.env.PATH ?? '', NO_COLOR: '1' },
    })
    const timer = setTimeout(() => proc.kill(), 30_000)
    const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
    clearTimeout(timer)
    if (code !== 0) throw new ScaffoldError(`Scaffolder failed: ${stderr.trim().slice(0, 500) || `exit ${code}`}`)

    const files: ScaffoldFile[] = []
    for (const path of (await walk(target)).sort()) {
      const full = join(target, path)
      const mode = (await stat(full)).mode
      files.push({ path: path.split('\\').join('/'), content: await readFile(full), executable: (mode & 0o111) !== 0 })
    }
    if (input.kind === 'driver' && !files.some((f) => f.path === '.gitignore')) {
      files.push({
        path: '.gitignore',
        content: Buffer.from('/target\n/ui/node_modules\n/ui/dist\n'),
        executable: false,
      })
    }
    return files
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Point the generated README at the bounty the repo was created for. */
export function withBountyNote(files: ScaffoldFile[], note: string): ScaffoldFile[] {
  return files.map((f) =>
    f.path === 'README.md' ? { ...f, content: Buffer.concat([f.content, Buffer.from(`\n${note}\n`)]) } : f,
  )
}
