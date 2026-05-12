import { Elysia, t } from 'elysia'
import { db } from '../../../../db'
import { plugins } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

const releaseSchema = t.Object({
  id: t.String(),
  pluginId: t.String(),
  version: t.String(),
  minTabularisVersion: t.Nullable(t.String()),
  assets: t.Record(t.String(), t.String()),
  createdAt: t.Number(),
})

const pluginDetailSchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  name: t.String(),
  description: t.String(),
  author: t.String(),
  repoUrl: t.String(),
  homepage: t.String(),
  latestVersion: t.Nullable(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
  releases: t.Array(releaseSchema),
})

const errorSchema = t.Object({ error: t.String() })

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
  }, {
    detail: { tags: ['Plugins'] },
    response: {
      200: pluginDetailSchema,
      404: errorSchema,
    },
  })
