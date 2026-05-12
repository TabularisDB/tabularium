import { Elysia } from 'elysia'
import { db } from '../../../../db'
import { plugins } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

export default new Elysia()
  .get('/', async ({ params, set }) => {
    const plugin = await db.query.plugins.findFirst({
      where: eq(plugins.id, params.slug),
      with: { releases: true },
    })

    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }

    const { webhookSecret, ...rest } = plugin
    return {
      ...rest,
      releases: plugin.releases.map((r) => ({
        ...r,
        assets: JSON.parse(r.assets) as Record<string, string>,
      })),
    }
  })
