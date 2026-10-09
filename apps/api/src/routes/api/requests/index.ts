import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { pluginRequests, pluginRequestClaims } from '$db/schema'
import { desc, count, eq, and, inArray } from 'drizzle-orm'
import { getFeatures } from '$lib/features'
import { verifySessionToken, delegatedAccess } from '$lib/access'
import { isKindKey } from '$lib/kinds'
import { deriveSlug } from '$lib/slug'

// Same normalisation submissions apply to repo names, so a request for
// "Awesome Plugin" is closed automatically when `awesome` gets published.
function slugFromName(name: string): string {
  return deriveSlug(
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-'),
  ).slice(0, 80)
}

const requestSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.String(),
  kind: t.Nullable(t.String()),
  requesterId: t.String(),
  upvotes: t.Number(),
  createdAt: t.Number(),
  claims: t.Number(),
  claimedByMe: t.Boolean(),
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
  kind: t.Nullable(t.String()),
  requesterId: t.String(),
})

const errorSchema = t.Object({ error: t.String() })

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Number(raw ?? def)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

async function resolveOptionalViewer(
  headers: Record<string, string | undefined>,
  cookie: Record<string, { value?: unknown } | undefined>,
): Promise<{ sub: string } | null> {
  const authHeader = headers.authorization
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const raw = cookie.auth?.value
  const cookieToken = typeof raw === 'string' ? raw : undefined
  const token = bearerToken ?? cookieToken
  if (!token) return null
  const payload = await verifySessionToken(token)
  return payload ? { sub: payload.sub } : null
}

export default new Elysia()
  .get(
    '/',
    async ({ query, headers, cookie, request }) => {
      const page = clampInt(query.page, 1, 1, 10_000)
      const limit = clampInt(query.limit, 20, 1, 100)
      const offset = (page - 1) * limit
      const sort = query.sort === 'recent' ? pluginRequests.createdAt : pluginRequests.upvotes
      const where = query.kind ? eq(pluginRequests.kind, query.kind) : undefined

      const [{ total }] = await db.select({ total: count() }).from(pluginRequests).where(where)

      const rows = await db.select().from(pluginRequests).where(where).orderBy(desc(sort)).limit(limit).offset(offset)

      const viewer = delegatedAccess(request)?.user ?? (await resolveOptionalViewer(headers, cookie))
      const ids = rows.map((r) => r.id)
      const claimRows =
        ids.length === 0
          ? []
          : await db
              .select({ requestId: pluginRequestClaims.requestId, n: count() })
              .from(pluginRequestClaims)
              .where(inArray(pluginRequestClaims.requestId, ids))
              .groupBy(pluginRequestClaims.requestId)
      const claimsByRequest = new Map<string, number>(claimRows.map((r) => [r.requestId, r.n]))

      let myClaimSet = new Set<string>()
      if (viewer && ids.length > 0) {
        const mine = await db
          .select({ requestId: pluginRequestClaims.requestId })
          .from(pluginRequestClaims)
          .where(and(eq(pluginRequestClaims.userId, viewer.sub), inArray(pluginRequestClaims.requestId, ids)))
        myClaimSet = new Set(mine.map((r) => r.requestId))
      }

      return {
        total,
        page,
        limit,
        requests: rows.map((r) => ({
          ...r,
          claims: claimsByRequest.get(r.id) ?? 0,
          claimedByMe: myClaimSet.has(r.id),
        })),
      }
    },
    {
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
        sort: t.Optional(
          t.Union([t.Literal('upvotes'), t.Literal('recent')], {
            description: 'Sort order: `upvotes` (default) or `recent` (newest first).',
          }),
        ),
        kind: t.Optional(t.String({ description: 'Only requests for this plugin kind key (see `GET /api/kinds`).' })),
      }),
      response: { 200: requestListResponseSchema },
    },
  )
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'requests-create', limit: 5, windowSeconds: 3600 }))
  .post(
    '/',
    async ({ user, body, set }) => {
      if (!getFeatures().requestsEnabled) {
        set.status = 403
        return { error: 'Plugin requests are disabled on this instance.' }
      }
      const slug = body.slug ?? slugFromName(body.name)
      if (!slug) {
        set.status = 400
        return { error: 'Name must contain at least one letter or digit.' }
      }
      const kind = body.kind || null
      if (kind && !isKindKey(kind)) {
        set.status = 400
        return { error: `Unknown plugin kind '${kind}'.` }
      }
      const existing = await db.query.pluginRequests.findFirst({
        where: { slug },
      })
      if (existing) {
        set.status = 409
        return { error: `A request for '${existing.name}' already exists` }
      }

      const request = {
        id: ulid(),
        slug,
        name: body.name,
        description: body.description,
        kind,
        requesterId: user.sub,
      }
      await db.insert(pluginRequests).values(request)
      return request
    },
    {
      detail: {
        tags: ['Requests'],
        summary: 'Create plugin request',
        description:
          'Add a new entry to the community wishlist. Requires auth. `slug` is optional and derived from `name` when omitted; it must be unique across requests. `kind` must match a configured plugin kind key.',
        operationId: 'createRequest',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        slug: t.Optional(
          t.String({
            pattern: '^[a-z0-9-]+$',
            minLength: 1,
            maxLength: 80,
            description: 'URL-safe slug. Lowercase letters, digits, hyphens. Derived from `name` when omitted.',
          }),
        ),
        name: t.String({ minLength: 1, maxLength: 120, description: 'Human-readable plugin name.' }),
        description: t.String({ minLength: 1, maxLength: 2000, description: 'What the plugin should do.' }),
        kind: t.Optional(t.String({ maxLength: 40, description: 'Plugin kind key from `GET /api/kinds`.' })),
      }),
      response: {
        200: createRequestResponseSchema,
        400: errorSchema,
        403: errorSchema,
        409: errorSchema,
      },
    },
  )
