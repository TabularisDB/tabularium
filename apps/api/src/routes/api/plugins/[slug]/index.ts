import { Elysia, t } from 'elysia'
import { db } from '$db'
import { plugins, releases } from '$db/schema'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '$middleware/auth'
import { projectPluginDetail } from '$lib/plugin-projection'
import { renderMarkdown } from '$lib/markdown'
import { cache, isString } from '$lib/cache'
import { buildIntegrity } from '$lib/release-integrity'

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

const integritySchema = t.Object({
  jws: t.String(),
  assets: t.Array(
    t.Object({
      name: t.String(),
      sha256: t.String(),
      size: t.Number(),
      attestation_bundle: t.Any(),
    }),
  ),
  manifest_raw: t.Nullable(t.String()),
})

const releaseSchema = t.Object({
  id: t.String(),
  pluginId: t.String(),
  version: t.String(),
  minRuntimeVersion: t.Nullable(t.String()),
  assets: t.Record(t.String(), assetEntrySchema),
  createdAt: t.Number(),
  integrity: t.Nullable(integritySchema),
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
  verified: t.Boolean(),
  verifiedAt: t.Nullable(t.Number()),
  extensions: t.Nullable(t.Record(t.String(), t.Any())),
  downloads: t.Number(),
  manifestFetchedAt: t.Nullable(t.Number()),
  readmeHtml: t.Nullable(t.String()),
  readmeLocale: t.Nullable(t.String()),
  readmeAvailableLocales: t.Array(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
  releases: t.Array(releaseSchema),
})

function pickReadme(
  raw: string | null,
  preferredLocale: string | undefined,
): { markdown: string | null; locale: string | null; available: string[] } {
  if (!raw) return { markdown: null, locale: null, available: [] }
  if (!raw.startsWith('{')) return { markdown: raw, locale: null, available: [] }
  try {
    const map = JSON.parse(raw) as Record<string, unknown>
    const available = Object.keys(map).filter((k) => typeof map[k] === 'string')
    if (available.length === 0) return { markdown: null, locale: null, available: [] }
    const pick = (locale: string | undefined): string | null => {
      if (locale && typeof map[locale] === 'string') return locale
      return null
    }
    const baseLocale = preferredLocale?.split('-')[0]
    const chosen = pick(preferredLocale) ?? pick(baseLocale) ?? pick('en') ?? available[0]
    return { markdown: map[chosen] as string, locale: chosen, available }
  } catch {
    return { markdown: raw, locale: null, available: [] }
  }
}

const errorSchema = t.Object({ error: t.String() })

const README_TTL = 600

export default new Elysia()
  .get(
    '/',
    async ({ params, query, set }) => {
      const plugin = await db.query.plugins.findFirst({
        where: { id: params.slug },
        with: { releases: true },
      })

      if (!plugin || plugin.status !== 'approved') {
        set.status = 404
        return { error: 'Plugin not found' } as unknown as never
      }

      const detail = projectPluginDetail(plugin)
      const picked = pickReadme(detail.readmeMarkdown, query.locale)
      let readmeHtml: string | null = null
      if (picked.markdown) {
        const cacheKey = `plugin:readme:${plugin.id}:${plugin.updatedAt}:${picked.locale ?? 'default'}`
        readmeHtml = await cache().get<string>(cacheKey, isString)
        if (!readmeHtml) {
          readmeHtml = await renderMarkdown(picked.markdown)
          await cache().set(cacheKey, readmeHtml, README_TTL)
        }
      }

      const releasesWithIntegrity = await Promise.all(
        detail.releases.map(async (r) => ({
          ...r,
          integrity: await buildIntegrity({ slug: plugin.id, version: r.version }),
        })),
      )

      return {
        ...detail,
        releases: releasesWithIntegrity,
        readmeHtml,
        readmeLocale: picked.locale,
        readmeAvailableLocales: picked.available,
        readmeMarkdown: undefined,
      } as never
    },
    {
      detail: {
        tags: ['Plugins'],
        summary: 'Get plugin detail',
        description:
          'Full plugin record including release history and the rendered README HTML (sanitized via DOMPurify, cached 10 min). Public — no auth required. Pass `?locale=` to request a localized README; falls back to base language, then `en`, then the first available.',
        operationId: 'getPlugin',
      },
      params: t.Object({ slug: t.String() }),
      query: t.Object({ locale: t.Optional(t.String({ maxLength: 10 })) }),
      response: {
        200: pluginDetailSchema,
        404: errorSchema,
      },
    },
  )
  .use(authMiddleware)
  .delete(
    '/',
    async ({ user, params, set }) => {
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
    },
    {
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
    },
  )
