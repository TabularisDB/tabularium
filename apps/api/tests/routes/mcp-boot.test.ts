import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

for (const installed of [false, true]) {
  test(`real API boot: MCP/OAuth ${installed ? 'available after migration' : 'blocked until setup'}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tabularium-mcp-boot-'))
    const reserve = Bun.serve({ port: 0, fetch: () => new Response() })
    const port = reserve.port!
    reserve.stop(true)
    const base = `http://localhost:${port}`
    await Bun.write(
      join(dir, 'config.json'),
      JSON.stringify({ installed, ...(installed ? { database: { url: join(dir, 'registry.db') } } : {}) }),
    )
    const proc = Bun.spawn(['bun', 'src/index.ts'], {
      cwd: resolve(import.meta.dir, '../..'),
      env: {
        ...process.env,
        CONFIG_PATH: join(dir, 'config.json'),
        DATA_DIR: dir,
        PORT: String(port),
        BASE_URL: base,
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
      },
      stdout: 'ignore',
      stderr: 'pipe',
    })
    try {
      let ready = false
      for (let i = 0; i < 100; i++) {
        if (proc.exitCode !== null) throw new Error(await new Response(proc.stderr).text())
        try {
          const response = await fetch(`${base}/healthz`)
          if (response.ok) {
            ready = true
            break
          }
        } catch {
          /* Boot is still binding the socket. */
        }
        await Bun.sleep(50)
      }
      expect(ready).toBe(true)
      for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp']) {
        expect((await fetch(base + path)).status).toBe(installed ? 200 : 503)
      }
      expect(
        (await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
          .status,
      ).toBe(installed ? 401 : 503)
      expect(
        (
          await fetch(`${base}/oauth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ client_name: 'Boot test', redirect_uris: ['http://localhost/callback'] }),
          })
        ).status,
      ).toBe(installed ? 201 : 503)
    } finally {
      proc.kill()
      await proc.exited
      await rm(dir, { recursive: true, force: true })
    }
  }, 15_000)
}
