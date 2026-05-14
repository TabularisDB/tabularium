import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { authMiddleware } from '../../../middleware/auth'
import { rateLimit } from '../../../middleware/rate-limit'
import { db } from '../../../db'
import { pluginRequests } from '../../../db/schema'
import { desc, count, eq } from 'drizzle-orm'
import { getFeatures } from '../../../lib/features'

const requestSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.String(),
  requesterId: t.String(),
  upvotes: t.Number(),
  createdAt: t.Number(),
})

const requestListResponseSchema = t.Object({
  total: t.Number(),
  page: t.Number(),
  limit: t.Number(),
  requests: t.Array(requestSchema),
})

const createRequestResponseSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.String(),
  requesterId: t.String(),
})

const errorSchema = t.Object({ error: t.String() })

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Number(raw ?? def)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export default new Elysia()
  .get('/', async ({ query }) => {
    const page = clampInt(query.page, 1, 1, 10_000)
    const limit = clampInt(query.limit, 20, 1, 100)
    const offset = (page - 1) * limit
    const sort = query.sort === 'recent' ? pluginRequests.createdAt : pluginRequests.upvotes

    const [{ total }] = await db.select({ total: count() }).from(pluginRequests)

    const rows = await db
      .select()
      .from(pluginRequests)
      .orderBy(desc(sort))
      .limit(limit)
      .offset(offset)

    return { total, page, limit, requests: rows }
  }, {
    detail: {
      tags: ['Requests'],
      summary: 'List plugin requests',
      description:
        'Browse the community wishlist of plugins users would like to see. Sorted by upvotes by default. Public — no auth required.',
      operationId: 'listRequests',
    },
    query: t.Object({
      page: t.Optional(t.String({ description: '1-based page index. Default 1.' })),
      limit: t.Optional(t.String({ description: 'Items per page, max 100. Default 20.' })),
      sort: t.Optional(t.Union([t.Literal('upvotes'), t.Literal('recent')], {
        description: 'Sort order: `upvotes` (default) or `recent` (newest first).',
      })),
    }),
    response: { 200: requestListResponseSchema },
  })
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'requests-create', limit: 5, windowSeconds: 3600 }))
  .post('/', async ({ user, body, set }) => {
    if (!getFeatures().requestsEnabled) {
      set.status = 403
      return { error: 'Plugin requests are disabled on this instance.' }
    }
    const existing = await db.query.pluginRequests.findFirst({
      where: { slug: body.slug },
    })
    if (existing) {
      set.status = 409
      return { error: `A request for '${body.slug}' already exists` }
    }

    const request = {
      id: ulid(),
      slug: body.slug,
      name: body.name,
      description: body.description,
      requesterId: user.sub,
    }
    await db.insert(pluginRequests).values(request)
    return request
  }, {
    detail: {
      tags: ['Requests'],
      summary: 'Create plugin request',
      description: 'Add a new entry to the community wishlist. Requires auth. Slug must be unique across requests.',
      operationId: 'createRequest',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      slug: t.String({ pattern: '^[a-z0-9-]+$', description: 'URL-safe slug. Lowercase letters, digits, hyphens.' }),
      name: t.String({ description: 'Human-readable plugin name.' }),
      description: t.String({ description: 'What the plugin should do.' }),
    }),
    response: {
      200: createRequestResponseSchema,
      403: errorSchema,
      409: errorSchema,
    },
  })
