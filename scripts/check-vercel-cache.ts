import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { $ } from 'bun'

const app = process.argv[2]
assert(app === 'website' || app === 'docs', 'Expected website or docs')
const root = resolve(import.meta.dir, '..')
const output = join(root, 'apps', app, '.vercel/output')
const cache = await mkdtemp(join(tmpdir(), 'tabularium-vercel-cache-'))
const args = ['run', 'build', `--filter=@tabularium/${app}`, '--cache=local:rw', `--cache-dir=${cache}`]

async function snapshot() {
  assert.equal((await Bun.file(join(output, 'config.json')).json()).version, 3)
  const files = []
  for await (const file of new Bun.Glob('**/*').scan({ cwd: output, onlyFiles: true, followSymlinks: true })) {
    const hash = createHash('sha256')
      .update(await Bun.file(join(output, file)).bytes())
      .digest('hex')
    files.push(`${file}:${hash}`)
  }
  assert(files.length > 1, 'Expected deployment payloads, not only a config file')
  return files.sort()
}

try {
  await $`bunx turbo ${args}`.cwd(root)
  const before = await snapshot()
  await rm(output, { recursive: true, force: true })
  await rm(join(root, 'apps', app, '.svelte-kit'), { recursive: true, force: true })
  const plan = await $`bunx turbo ${args} --dry=json`.cwd(root).quiet().json()
  assert.equal(
    plan.tasks.find((task: { taskId: string }) => task.taskId === `@tabularium/${app}#build`)?.cache.status,
    'HIT',
  )
  await $`bunx turbo ${args}`.cwd(root)
  assert.deepEqual(await snapshot(), before, 'Cached build must restore every Vercel output file')
  console.log(`PASS: ${app} cache hit restored ${before.length} identical deployment files`)
} finally {
  await rm(cache, { recursive: true, force: true })
}
