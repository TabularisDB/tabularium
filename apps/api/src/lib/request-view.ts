import { t } from 'elysia'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '$db'
import { identities, plugins, pluginRequestClaims, pluginRequestVotes, providerInstances, users } from '$db/schema'
import { bountySchema, parseBounty } from '$lib/request-bounty'

type RequestRow = typeof import('$db/schema').pluginRequests.$inferSelect

export const claimerSchema = t.Object({
  userId: t.String(),
  username: t.Nullable(t.String()),
  displayName: t.String(),
  avatarUrl: t.Nullable(t.String()),
  repoUrl: t.Nullable(t.String()),
  claimedAt: t.Number(),
})

export const requestViewSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.String(),
  kind: t.Nullable(t.String()),
  requesterId: t.String(),
  status: t.Union([t.Literal('pending'), t.Literal('approved'), t.Literal('rejected'), t.Literal('fulfilled')]),
  rejectionReason: t.Nullable(t.String()),
  bounty: t.Nullable(bountySchema),
  upvotes: t.Number(),
  createdAt: t.Number(),
  updatedAt: t.Nullable(t.Number()),
  fulfilledAt: t.Nullable(t.Number()),
  fulfilledPlugin: t.Nullable(t.Object({ id: t.String(), name: t.String() })),
  claims: t.Number(),
  claimers: t.Array(claimerSchema),
  claimedByMe: t.Boolean(),
  votedByMe: t.Boolean(),
})

export type Claimer = typeof claimerSchema.static
export type RequestView = typeof requestViewSchema.static

// GitHub avatars are addressable by the numeric account id, which survives
// renames. Other providers have no stable unauthenticated avatar URL.
function avatarUrl(kind: string, externalId: string): string | null {
  return kind === 'github' ? `https://avatars.githubusercontent.com/u/${encodeURIComponent(externalId)}?v=4` : null
}

/** Claimers per request, oldest claim first, with their repo when scaffolded. */
export async function loadClaimers(requestIds: string[]): Promise<Map<string, Claimer[]>> {
  const out = new Map<string, Claimer[]>()
  if (requestIds.length === 0) return out
  const rows = await db
    .select({
      requestId: pluginRequestClaims.requestId,
      userId: pluginRequestClaims.userId,
      repoUrl: pluginRequestClaims.repoUrl,
      claimedAt: pluginRequestClaims.createdAt,
      displayName: users.displayName,
    })
    .from(pluginRequestClaims)
    .innerJoin(users, eq(users.id, pluginRequestClaims.userId))
    .where(inArray(pluginRequestClaims.requestId, requestIds))
    .orderBy(pluginRequestClaims.createdAt)

  const userIds = [...new Set(rows.map((r) => r.userId))]
  const idRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            userId: identities.userId,
            username: identities.username,
            externalId: identities.externalId,
            kind: providerInstances.kind,
            createdAt: identities.createdAt,
          })
          .from(identities)
          .innerJoin(providerInstances, eq(providerInstances.id, identities.providerInstanceId))
          .where(inArray(identities.userId, userIds))
          .orderBy(identities.createdAt)
  // First linked identity wins, preferring GitHub for the avatar.
  const identityByUser = new Map<string, (typeof idRows)[number]>()
  for (const row of idRows) {
    const current = identityByUser.get(row.userId)
    if (!current || (current.kind !== 'github' && row.kind === 'github')) identityByUser.set(row.userId, row)
  }

  for (const row of rows) {
    const identity = identityByUser.get(row.userId)
    const list = out.get(row.requestId) ?? []
    list.push({
      userId: row.userId,
      username: identity?.username ?? null,
      displayName: row.displayName,
      avatarUrl: identity ? avatarUrl(identity.kind, identity.externalId) : null,
      repoUrl: row.repoUrl ?? null,
      claimedAt: row.claimedAt,
    })
    out.set(row.requestId, list)
  }
  return out
}

/** Public shape of requests, with per-viewer flags when a viewer is known. */
export async function toRequestViews(rows: RequestRow[], viewerId: string | null): Promise<RequestView[]> {
  const ids = rows.map((r) => r.id)
  const claimers = await loadClaimers(ids)

  let voted = new Set<string>()
  if (viewerId && ids.length > 0) {
    const mine = await db
      .select({ requestId: pluginRequestVotes.requestId })
      .from(pluginRequestVotes)
      .where(and(eq(pluginRequestVotes.userId, viewerId), inArray(pluginRequestVotes.requestId, ids)))
    voted = new Set(mine.map((r) => r.requestId))
  }

  const pluginIds = [...new Set(rows.map((r) => r.fulfilledPluginId).filter((v): v is string => !!v))]
  const pluginRows =
    pluginIds.length === 0
      ? []
      : await db.select({ id: plugins.id, name: plugins.name }).from(plugins).where(inArray(plugins.id, pluginIds))
  const pluginById = new Map(pluginRows.map((p) => [p.id, p]))

  return rows.map((r) => {
    const list = claimers.get(r.id) ?? []
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      kind: r.kind ?? null,
      requesterId: r.requesterId,
      status: r.status,
      rejectionReason: r.status === 'rejected' ? (r.rejectionReason ?? null) : null,
      bounty: parseBounty(r.bounty),
      upvotes: r.upvotes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt ?? null,
      fulfilledAt: r.fulfilledAt ?? null,
      fulfilledPlugin: r.fulfilledPluginId ? (pluginById.get(r.fulfilledPluginId) ?? null) : null,
      claims: list.length,
      claimers: list,
      claimedByMe: viewerId ? list.some((c) => c.userId === viewerId) : false,
      votedByMe: voted.has(r.id),
    }
  })
}

export async function toRequestView(row: RequestRow, viewerId: string | null): Promise<RequestView> {
  const [view] = await toRequestViews([row], viewerId)
  return view
}
