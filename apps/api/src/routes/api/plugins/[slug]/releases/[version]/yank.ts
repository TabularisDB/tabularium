import { Elysia, t } from 'elysia'
import { and, eq } from 'drizzle-orm'
import { db } from '$db'
import { releases } from '$db/schema'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { recordAudit, actorFromUser } from '$lib/audit'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'

export default new Elysia()
  .use(authMiddleware)
  .use(
    rateLimit({
      bucket: 'plugin.author.yank',
      limit: 10,
      windowSeconds: 60,
      keyFn: ({ user, request }) => {
        const url = new URL(request.url)
        const slug = url.pathname.split('/')[3] ?? 'unknown'
        return `plugin:${slug}:${user?.sub ?? 'anon'}`
      },
    }),
  )
  .post(
    '/',
    async ({ params, body, set, user, request }) => {
      const slug = params.slug
      const version = params.version.replace(/^v/, '')

      const plugin = await db.query.plugins.findFirst({ where: { id: slug } })
      if (!plugin) {
        set.status = 404
        return { error: `plugin "${slug}" not found` }
      }
      if (plugin.ownerId !== user.sub) {
        set.status = 403
        return { error: 'Only the plugin owner can yank a release' }
      }

      const release = await db.query.releases.findFirst({
        where: { pluginId: slug, version },
      })
      if (!release) {
        set.status = 404
        return { error: `release v${version} not found` }
      }

      if (body.unyank === true) {
        await db
          .update(releases)
          .set({ yankedAt: null, yankedBy: null, yankReason: null })
          .where(and(eq(releases.pluginId, slug), eq(releases.version, version)))
        await cache().del(latestCacheKey(slug))
        await recordAudit({
          ...actorFromUser(user, request),
          action: 'plugin.unyank',
          target: `plugin:${slug}`,
          meta: { version, by: 'author' },
        })
        return { slug, version, yanked: false }
      }

      if (release.yankedAt !== null) {
        return { slug, version, yanked: true, alreadyYanked: true }
      }

      await db
        .update(releases)
        .set({ yankedAt: Date.now(), yankedBy: user.sub, yankReason: body.reason ?? null })
        .where(and(eq(releases.pluginId, slug), eq(releases.version, version)))
      await cache().del(latestCacheKey(slug))
      await recordAudit({
        ...actorFromUser(user, request),
        action: 'plugin.yank',
        target: `plugin:${slug}`,
        meta: { version, reason: body.reason ?? null, by: 'author' },
      })
      return { slug, version, yanked: true }
    },
    {
      detail: {
        tags: ['Plugins'],
        summary: 'Yank (or unyank) a release (plugin owner)',
        description:
          'Cookie/JWT-authenticated yank for plugin owners — same semantics as the publisher-token endpoint at /api/publish/:slug/yank but uses the logged-in session so owners can manage releases from the UI without minting a token. Pass `unyank: true` to clear the flag.',
        operationId: 'authorYankRelease',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ slug: t.String(), version: t.String() }),
      body: t.Object({
        reason: t.Optional(t.String({ maxLength: 500 })),
        unyank: t.Optional(t.Boolean()),
      }),
      response: {
        200: t.Object({
          slug: t.String(),
          version: t.String(),
          yanked: t.Boolean(),
          alreadyYanked: t.Optional(t.Boolean()),
        }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
  )
