import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { fetchSchema } from '../src/index'

let server: ReturnType<typeof Bun.serve>
let baseUrl = ''

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/manifest.schema.json') {
        const body = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id:
            'https://test.local/manifest.schema.json' +
            (url.searchParams.get('kind') ? `?kind=${url.searchParams.get('kind')}` : ''),
          type: 'object',
          properties: { name: { type: 'string' } },
        }
        return new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/schema+json' },
        })
      }
      return new Response('not found', { status: 404 })
    },
  })
  baseUrl = `http://localhost:${server.port}`
})

afterAll(() => server.stop())

describe('fetchSchema', () => {
  it('fetches the merged schema from /manifest.schema.json', async () => {
    const schema = await fetchSchema(baseUrl)
    expect((schema as { type: string }).type).toBe('object')
    expect((schema as { $id: string }).$id).not.toContain('?kind=')
  })

  it('appends the kind query parameter when given', async () => {
    const schema = await fetchSchema(baseUrl, { kind: 'theme' })
    expect((schema as { $id: string }).$id).toContain('?kind=theme')
  })

  it('throws on non-2xx response', async () => {
    await expect(fetchSchema(baseUrl + '/does-not-exist')).rejects.toThrow()
  })
})
