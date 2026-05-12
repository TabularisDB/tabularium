import { Elysia } from 'elysia'
import staticPlugin from '@elysiajs/static'
import { resolve } from 'node:path'

async function loadRoutes(dir: string): Promise<Elysia[]> {
  const glob = new Bun.Glob('**/*.{ts,tsx,js,jsx,mjs,cjs}')
  const mounts: Elysia[] = []
  for await (const file of glob.scan(dir)) {
    const mod = await import(resolve(dir, file))
    if (mod.default instanceof Elysia) mounts.push(mod.default)
  }
  return mounts
}

const routes = await loadRoutes(resolve('./src/routes'))
const app = new Elysia({ systemRouter: false })
  .use(staticPlugin({ assets: resolve('./frontend/dist'), prefix: '/' }))
const mounted = routes.reduce((a, r) => a.use(r), app)
mounted.listen(Number(Bun.env.PORT ?? 3000))

console.log(`Registry running on http://localhost:${app.server?.port}`)

export type App = typeof app
