import { Elysia, t } from 'elysia'
import { and, eq } from 'drizzle-orm'
import { db } from '$db'
import { releases } from '$db/schema'
import { publisherTokenMiddleware } from '$middleware/publisher-token'
import { hasScope } from '$lib/publisher-tokens'
import { recordAudit } from '$lib/audit'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'

export default new Elysia().use(publisherTokenMiddleware).post(
  '/',
  async ({ params, body, set, publisher, request }) => {
    const slug = params.slug
    const version = body.version.replace(/^v/, '')

    const plugin = await db.query.plugins.findFirst({ where: { id: slug } })
    if (!plugin) {
      set.status = 404
      return { error: `plugin "${slug}" not found` }
    }
    if (publisher.userId !== plugin.ownerId) {
      set.status = 403
      return { error: 'only the plugin owner can yank a release' }
    }
    if (!hasScope(`yank:${slug}`, publisher.scopes)) {
      await recordAudit({
        actorId: publisher.userId,
        action: 'plugin.yank_denied',
        target: `plugin:${slug}`,
        meta: { version, tokenId: publisher.id, scopes: publisher.scopes },
        ip: request.headers.get('x-forwarded-for') ?? null,
      })
      set.status = 403
      return { error: `token lacks yank:${slug} (or yank:*) scope` }
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
        actorId: publisher.userId,
        action: 'plugin.unyank',
        target: `plugin:${slug}`,
        meta: { version, tokenId: publisher.id },
        ip: request.headers.get('x-forwarded-for') ?? null,
      })
      return { slug, version, yanked: false }
    }

    // Idempotent yank: if already yanked, keep the original reason/timestamp.
    if (release.yankedAt !== null) {
      return { slug, version, yanked: true, alreadyYanked: true }
    }

    await db
      .update(releases)
      .set({ yankedAt: Date.now(), yankedBy: publisher.userId, yankReason: body.reason ?? null })
      .where(and(eq(releases.pluginId, slug), eq(releases.version, version)))
    await cache().del(latestCacheKey(slug))
    await recordAudit({
      actorId: publisher.userId,
      action: 'plugin.yank',
      target: `plugin:${slug}`,
      meta: { version, reason: body.reason ?? null, tokenId: publisher.id },
      ip: request.headers.get('x-forwarded-for') ?? null,
    })
    return { slug, version, yanked: true }
  },
  {
    detail: {
      tags: ['Publish'],
      summary: 'Yank (or unyank) a release',
      description:
        'Marks a release as yanked: it stays resolvable for pinned consumers but is hidden from /latest ' +
        'and from default list responses. Pass `unyank: true` to clear the flag.',
      operationId: 'yankRelease',
      security: [{ publisherToken: [] }],
    },
    params: t.Object({ slug: t.String() }),
    body: t.Object({
      version: t.String({ minLength: 1, maxLength: 40 }),
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
