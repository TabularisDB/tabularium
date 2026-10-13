import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { pluginRequests } from '$db/schema'
import { desc, count, eq, and, or, inArray, type SQL } from 'drizzle-orm'
import { getFeatures } from '$lib/features'
import { getKinds, isKindKey } from '$lib/kinds'
import { deriveSlug } from '$lib/slug'
import { emitEvent } from '$lib/webhooks/events'
import { resolveOptionalViewer } from '$lib/optional-viewer'
import { isRequestStatus, PUBLIC_REQUEST_STATUSES, type RequestStatus } from '$lib/request-bounty'
import { requestViewSchema, toRequestViews } from '$lib/request-view'

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

const requestListResponseSchema = t.Object({
  total: t.Number(),
  page: t.Number(),
  limit: t.Number(),
  requests: t.Array(requestViewSchema),
})

const createRequestResponseSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.String(),
  kind: t.Nullable(t.String()),
  requesterId: t.String(),
  status: t.String(),
})

const errorSchema = t.Object({ error: t.String() })

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Number(raw ?? def)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function parseStatuses(raw: string | undefined): RequestStatus[] {
  if (!raw) return PUBLIC_REQUEST_STATUSES
  const list = [...new Set(raw.split(',').map((s) => s.trim()))].filter(isRequestStatus)
  return list.length > 0 ? list : PUBLIC_REQUEST_STATUSES
}

// Public statuses are visible to everyone; pending and rejected ones only to
// admins, and to the requester for their own requests.
async function visibilityFilter(statuses: RequestStatus[], viewerId: string | null): Promise<SQL | undefined> {
  const isAdmin = viewerId
    ? (await db.query.users.findFirst({ where: { id: viewerId }, columns: { role: true } }))?.role === 'admin'
    : false
  if (isAdmin) return inArray(pluginRequests.status, statuses)
  const open = statuses.filter((s) => PUBLIC_REQUEST_STATUSES.includes(s))
  const own = statuses.filter((s) => !PUBLIC_REQUEST_STATUSES.includes(s))
  const parts: SQL[] = []
  if (open.length > 0) parts.push(inArray(pluginRequests.status, open))
  if (own.length > 0 && viewerId) {
    parts.push(and(inArray(pluginRequests.status, own), eq(pluginRequests.requesterId, viewerId)) as SQL)
  }
  if (parts.length === 0) return eq(pluginRequests.id, '')
  return parts.length === 1 ? parts[0] : or(...parts)
}

export default new Elysia()
  .get(
    '/',
    async ({ query, headers, cookie, request }) => {
      const page = clampInt(query.page, 1, 1, 10_000)
      const limit = clampInt(query.limit, 20, 1, 100)
      const offset = (page - 1) * limit
      const sort = query.sort === 'recent' ? pluginRequests.createdAt : pluginRequests.upvotes
      const viewer = await resolveOptionalViewer(request, headers, cookie)
      const visible = await visibilityFilter(parseStatuses(query.status), viewer?.sub ?? null)
      const where = query.kind ? and(visible, eq(pluginRequests.kind, query.kind)) : visible

      const [{ total }] = await db.select({ total: count() }).from(pluginRequests).where(where)
      const rows = await db
        .select()
        .from(pluginRequests)
        .where(where)
        .orderBy(desc(sort), desc(pluginRequests.createdAt))
        .limit(limit)
        .offset(offset)

      return { total, page, limit, requests: await toRequestViews(rows, viewer?.sub ?? null) }
    },
    {
      detail: {
        tags: ['Requests'],
        summary: 'List plugin requests',
        description:
          'Browse the community wishlist of plugins users would like to see, with bounty metadata, claimers and the fulfilling plugin. Sorted by upvotes by default. Public — no auth required; with a session, `claimedByMe` and `votedByMe` are filled in. Only `approved` and `fulfilled` requests are public: `pending` and `rejected` ones are returned to admins, and to their requester.',
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
        status: t.Optional(
          t.String({
            description:
              'Comma-separated statuses: `pending`, `approved`, `rejected`, `fulfilled`. Default `approved,fulfilled`.',
          }),
        ),
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
      // Every request is filed under a kind once the instance defines any.
      if (!kind && getKinds().length > 0) {
        set.status = 400
        return { error: 'Pick a plugin kind for the request.' }
      }
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
        status: 'pending' as const,
      }
      await db.insert(pluginRequests).values(request)
      await emitEvent('request.created', {
        actor: { id: user.sub, name: user.username ?? null },
        request,
      })
      return request
    },
    {
      detail: {
        tags: ['Requests'],
        summary: 'Create plugin request',
        description:
          'Add a new entry to the community wishlist. Requires auth. New requests are `pending` until an admin approves them. `slug` is optional and derived from `name` when omitted; it must be unique across requests. `kind` must match a configured plugin kind key, and is required whenever the instance defines kinds.',
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
        kind: t.Optional(
          t.String({
            maxLength: 40,
            description: 'Plugin kind key from `GET /api/kinds`. Required when the instance defines kinds.',
          }),
        ),
      }),
      response: {
        200: createRequestResponseSchema,
        400: errorSchema,
        403: errorSchema,
        409: errorSchema,
      },
    },
  )
