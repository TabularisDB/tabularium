import { Elysia } from 'elysia'
import staticPlugin from '@elysiajs/static'
import { fileRouter } from 'elysia-file-router'
import { resolve } from 'node:path'

const app = new Elysia({ systemRouter: false })
  .use(staticPlugin({ assets: resolve('../frontend/dist'), prefix: '/' }))
  .use(await fileRouter({ dir: resolve('./src/routes'), types: false }))
  .listen(Number(Bun.env.PORT ?? 3000))

console.log(`Registry running on http://localhost:${app.server?.port}`)

export type App = typeof app
