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
    const file = join(workdir, 'good.yaml')
    writeFileSync(file, 'name: Good Plugin\nkind: theme\n')
    const { code, stdout } = await run(['validate', file, '--registry', baseUrl])
    expect(code).toBe(0)
    expect(stdout).toContain('ok')
  })

  it('exits 1 with structured errors for an invalid manifest', async () => {
    const file = join(workdir, 'bad.yaml')
    writeFileSync(file, 'name: 42\n')
    const { code, stdout, stderr } = await run(['validate', file, '--registry', baseUrl])
    expect(code).toBe(1)
    const combined = stdout + stderr
    expect(combined).toContain('/name')
    expect(combined).toContain('type')
  })
})
