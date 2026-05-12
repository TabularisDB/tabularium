import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'
import staticPlugin from '@elysiajs/static'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'

const app = new Elysia({ systemRouter: false })
  .use(
    openapi({
      documentation: {
        info: {
          title: 'Tabularis Plugin Registry API',
          version: '1.0.0',
          description: 'Index, submit, and discover plugins for the Tabularis app.',
        },
        servers: [
          { url: 'http://localhost:3000', description: 'Local dev' },
          { url: 'https://registry.tabularis.dev', description: 'Production' },
        ],
        tags: [
          { name: 'Plugins', description: 'List, search, and inspect plugins' },
          { name: 'Auth', description: 'OAuth login with GitHub or Gitea/Forgejo' },
          { name: 'Submit', description: 'Submit a new plugin' },
          { name: 'Webhooks', description: 'Release sync from GitHub/Gitea' },
          { name: 'Requests', description: 'Community plugin wish list' },
        ],
      },
    }),
  )
  .use(await fileRouter({ dir: resolve('./src/routes'), types: false }))
  .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/', noCache: false }))
  .get('/*', ({ path, set }) => {
    if (path.startsWith('/api') || path.startsWith('/auth') || path.startsWith('/openapi')) {
      set.status = 404
      return { error: 'Not found' }
    }
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return Bun.file(resolve('../frontend/dist/index.html'))
  })
  .listen(Number(Bun.env.PORT ?? 3000))

console.log(`Registry running on http://localhost:${app.server?.port}`)
console.log(`OpenAPI spec: http://localhost:${app.server?.port}/openapi/json`)
console.log(`OpenAPI UI:   http://localhost:${app.server?.port}/openapi`)

export type App = typeof app
