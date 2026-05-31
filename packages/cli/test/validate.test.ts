import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let server: ReturnType<typeof Bun.serve>
let baseUrl = ''
let workdir = ''

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/manifest.schema.json') {
        return Response.json({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 60 },
            kind: { type: 'string' },
          },
        })
      }
      return new Response('not found', { status: 404 })
    },
  })
  baseUrl = `http://localhost:${server.port}`
  workdir = mkdtempSync(join(tmpdir(), 'tabularium-cli-'))
})

afterAll(() => {
  server.stop()
  rmSync(workdir, { recursive: true, force: true })
})

async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'src/bin.ts', ...args], {
    cwd: new URL('..', import.meta.url).pathname,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

describe('tabularium validate', () => {
  it('exits 0 for a valid manifest', async () => {
    const file = join(workdir, 'good.json')
    writeFileSync(file, JSON.stringify({ name: 'Good Plugin', kind: 'theme' }))
    const { code, stdout } = await run(['validate', file, '--registry', baseUrl])
    expect(code).toBe(0)
    expect(stdout).toContain('ok')
  })

  it('exits 1 with structured errors for an invalid manifest', async () => {
    const file = join(workdir, 'bad.json')
    writeFileSync(file, JSON.stringify({ name: 42 }))
    const { code, stdout, stderr } = await run(['validate', file, '--registry', baseUrl])
    expect(code).toBe(1)
    const combined = stdout + stderr
    expect(combined).toContain('/name')
    expect(combined).toContain('type')
  })

  it('exits non-zero for an unparseable JSON file', async () => {
    const file = join(workdir, 'parse-error.json')
    writeFileSync(file, '{ name: [unterminated')
    const { code } = await run(['validate', file, '--registry', baseUrl])
    expect(code).not.toBe(0)
  })

  it('exits non-zero when the file does not exist', async () => {
    const file = join(workdir, 'missing.json')
    const { code } = await run(['validate', file, '--registry', baseUrl])
    expect(code).not.toBe(0)
  })

  it('exits non-zero when the registry is unreachable', async () => {
    const file = join(workdir, 'good-for-net-test.json')
    writeFileSync(file, JSON.stringify({ name: 'Good Plugin', kind: 'theme' }))
    const { code } = await run(['validate', file, '--registry', 'http://127.0.0.1:1'])
    expect(code).not.toBe(0)
  })

  it('rejects an invocation missing --registry', async () => {
    const file = join(workdir, 'noop.json')
    writeFileSync(file, JSON.stringify({ name: 'Good Plugin', kind: 'theme' }))
    const { code, stderr } = await run(['validate', file])
    expect(code).not.toBe(0)
    expect(stderr.toLowerCase()).toContain('--registry')
  })
})
