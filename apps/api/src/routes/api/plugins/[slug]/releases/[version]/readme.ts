import { Elysia, t } from 'elysia'
import { db } from '$db'
import { renderMarkdown } from '$lib/markdown'
import { cache, isString } from '$lib/cache'
import { pickReadme, README_TTL } from '$lib/readme'

// The README as it stood at a specific release. Captured at ingest from the
// release's tag, so browsing an older version shows the docs that shipped with
// it instead of the plugin's current README. Releases ingested before the
// column existed have none — the response says so rather than falling back to
// the current one, which would quietly misrepresent the old version.
export default new Elysia().get(
  '/',
  async ({ params, query, set }) => {
    const plugin = await db.query.plugins.findFirst({
      where: { id: params.slug },
      columns: { id: true, status: true },
    })
    if (!plugin || plugin.status !== 'approved') {
      set.status = 404
      return { error: 'Plugin not found' }
    }

    const release = await db.query.releases.findFirst({
      where: { pluginId: plugin.id, version: params.version },
      columns: { id: true, version: true, readme: true },
    })
    if (!release) {
      set.status = 404
      return { error: 'Release not found' }
    }

    const picked = pickReadme(release.readme ?? null, query.locale)
    if (!picked.markdown) {
      return {
        version: release.version,
        readmeHtml: null,
        readmeLocale: null,
        readmeAvailableLocales: [],
        captured: false,
      }
    }

    const cacheKey = `release:readme:${plugin.id}:${release.id}:${picked.locale ?? 'default'}`
    let readmeHtml = await cache().get<string>(cacheKey, isString)
    if (!readmeHtml) {
      readmeHtml = await renderMarkdown(picked.markdown)
      await cache().set(cacheKey, readmeHtml, README_TTL)
    }

    return {
      version: release.version,
      readmeHtml,
      readmeLocale: picked.locale,
      readmeAvailableLocales: picked.available,
      captured: true,
    }
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'README captured at a specific release',
      operationId: 'getReleaseReadme',
    },
    params: t.Object({ slug: t.String(), version: t.String() }),
    query: t.Object({ locale: t.Optional(t.String({ maxLength: 16 })) }),
    response: {
      200: t.Object({
        version: t.String(),
        readmeHtml: t.Nullable(t.String()),
        readmeLocale: t.Nullable(t.String()),
        readmeAvailableLocales: t.Array(t.String()),
        // false when this release predates per-release README capture
        captured: t.Boolean(),
      }),
      404: t.Object({ error: t.String() }),
    },
  },
)
