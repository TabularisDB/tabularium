import { Elysia, t } from 'elysia'
import { db } from '../../../../db'
import { plugins, releases } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../../../../middleware/auth'
import { projectPluginDetail } from '../../../../lib/plugin-projection'
import { renderMarkdown } from '../../../../lib/markdown'
import { cache, isString } from '../../../../lib/cache'

const screenshotSchema = t.Object({
  url: t.String(),
  caption: t.Nullable(t.String()),
  alt: t.Nullable(t.String()),
})

const assetEntrySchema = t.Object({
  url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
})

const releaseSchema = t.Object({
  id: t.String(),
  pluginId: t.String(),
  version: t.String(),
  minRuntimeVersion: t.Nullable(t.String()),
  assets: t.Record(t.String(), assetEntrySchema),
  createdAt: t.Number(),
})

const pluginDetailSchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  providerInstanceId: t.Nullable(t.String()),
  name: t.String(),
  description: t.String(),
  author: t.String(),
  repoUrl: t.String(),
  homepage: t.String(),
  latestVersion: t.Nullable(t.String()),
  status: t.Union([t.Literal('approved'), t.Literal('pending'), t.Literal('rejected')]),
  category: t.Nullable(t.String()),
  tags: t.Array(t.String()),
  license: t.Nullable(t.String()),
  iconUrl: t.Nullable(t.String()),
  screenshots: t.Array(screenshotSchema),
  documentationUrl: t.Nullable(t.String()),
  supportEmail: t.Nullable(t.String()),
  issuesUrl: t.Nullable(t.String()),
  featured: t.Boolean(),
  featuredOrder: t.Nullable(t.Number()),
  manifestFetchedAt: t.Nullable(t.Number()),
  readmeHtml: t.Nullable(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
  releases: t.Array(releaseSchema),
})

const errorSchema = t.Object({ error: t.String() })

const README_TTL = 600

export default new Elysia()
  .get('/', async ({ params, set }) => {
    const plugin = await db.query.plugins.findFirst({
      where: { id: params.slug },
      with: { releases: true },
    })

    if (!plugin || plugin.status !== 'approved') {
      set.status = 404
      return { error: 'Plugin not found' }
    }

    const detail = projectPluginDetail(plugin)
    let readmeHtml: string | null = null
    if (detail.readmeMarkdown) {
      const cacheKey = `plugin:readme:${plugin.id}:${plugin.updatedAt}`
      readmeHtml = await cache().get<string>(cacheKey, isString)
      if (!readmeHtml) {
        readmeHtml = renderMarkdown(detail.readmeMarkdown)
        await cache().set(cacheKey, readmeHtml, README_TTL)
      }
    }

    return {
      ...detail,
      readmeHtml,
      readmeMarkdown: undefined,
    } as unknown as typeof detail & { readmeHtml: string | null }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Get plugin detail',
      description:
        'Full plugin record including release history and the rendered README HTML (sanitized via DOMPurify, cached 10 min). Public — no auth required.',
      operationId: 'getPlugin',
    },
    params: t.Object({ slug: t.String() }),
    response: {
      200: pluginDetailSchema,
      404: errorSchema,
    },
  })
  .use(authMiddleware)
  .delete('/', async ({ user, params, set }) => {
    const plugin = await db.query.plugins.findFirst({
      where: { id: params.slug },
    })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    if (plugin.ownerId !== user.sub) {
      set.status = 403
      return { error: 'Only the owner can delete this plugin' }
    }

    await db.delete(releases).where(eq(releases.pluginId, plugin.id))
    await db.delete(plugins).where(eq(plugins.id, plugin.id))

    return { ok: true, slug: plugin.id }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Delete plugin',
      description:
        'Removes the plugin and all of its releases from the registry. Requires auth and only the owner can perform it. ' +
        'The upstream repo and the webhook on the repo are left untouched.',
      operationId: 'deletePlugin',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ slug: t.String() }),
  })
