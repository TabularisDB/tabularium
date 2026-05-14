import { Elysia, t } from 'elysia'
import { eq, and } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { plugins, releases } from '$db/schema'
import { parseAssets, serializeAssets, hashAsset, type AssetMap } from '$lib/asset'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia()
  .use(adminMiddleware)
  .post('/', async ({ params, body, set, admin, request }) => {
    const plugin = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    const version = body.version ?? plugin.latestVersion
    if (!version) {
      set.status = 400
      return { error: 'No version available — plugin has no releases' }
    }
    const release = await db.query.releases.findFirst({
      where: { pluginId: plugin.id, version },
    })
    if (!release) {
      set.status = 404
      return { error: `Release ${version} not found` }
    }

    const current = parseAssets(release.assets)
    const updated: AssetMap = { ...current }
    const results: Record<string, { sha256?: string; size?: number; reason?: string }> = {}

    for (const [platform, entry] of Object.entries(current)) {
      if (entry.sha256 && !body.force) {
        results[platform] = { sha256: entry.sha256, size: entry.size }
        continue
      }
      const result = await hashAsset(entry.url)
      results[platform] = result
      if (result.sha256) updated[platform] = { ...entry, sha256: result.sha256, size: result.size }
    }

    await db
      .update(releases)
      .set({ assets: serializeAssets(updated) })
      .where(and(eq(releases.pluginId, plugin.id), eq(releases.version, version)))
    await cache().del(latestCacheKey(plugin.id))
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'plugin.rehash',
      target: `plugin:${plugin.id}`,
      meta: { version, force: Boolean(body.force) },
    })

    return { ok: true, slug: plugin.id, version, results }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Re-hash release assets',
      description:
        'Re-fetches every asset of the given (or latest) release and updates `sha256` + `size`. Useful when the original ' +
        'webhook fetch failed. Set `force: true` to re-hash assets that already have a sha256.',
      operationId: 'rehashRelease',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      version: t.Optional(t.String()),
      force: t.Optional(t.Boolean()),
    }),
    response: {
      200: t.Object({
        ok: t.Boolean(),
        slug: t.String(),
        version: t.String(),
        results: t.Record(t.String(), t.Object({
          sha256: t.Optional(t.String()),
          size: t.Optional(t.Number()),
          reason: t.Optional(t.String()),
        })),
      }),
      400: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
  })
