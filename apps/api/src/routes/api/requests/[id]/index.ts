import { Elysia, t } from 'elysia'
import { db } from '$db'
import { resolveOptionalViewer } from '$lib/optional-viewer'
import { PUBLIC_REQUEST_STATUSES } from '$lib/request-bounty'
import { requestViewSchema, toRequestView } from '$lib/request-view'

export default new Elysia().get(
  '/',
  async ({ params, headers, cookie, request, set }) => {
    const row =
      (await db.query.pluginRequests.findFirst({ where: { id: params.id } })) ??
      (await db.query.pluginRequests.findFirst({ where: { slug: params.id } }))
    const viewer = await resolveOptionalViewer(request, headers, cookie)
    if (row && !PUBLIC_REQUEST_STATUSES.includes(row.status) && row.requesterId !== viewer?.sub) {
      const role = viewer
        ? (await db.query.users.findFirst({ where: { id: viewer.sub }, columns: { role: true } }))?.role
        : undefined
      if (role !== 'admin') {
        set.status = 404
        return { error: 'Request not found' }
      }
    }
    if (!row) {
      set.status = 404
      return { error: 'Request not found' }
    }
    return toRequestView(row, viewer?.sub ?? null)
  },
  {
    detail: {
      tags: ['Requests'],
      summary: 'Get a plugin request',
      description:
        'One request by id or slug, with bounty metadata, claimers and the fulfilling plugin. Public for `approved` and `fulfilled` requests; `pending` and `rejected` ones are visible to admins and their requester only.',
      operationId: 'getRequest',
    },
    params: t.Object({ id: t.String({ description: 'Request id or slug.' }) }),
    response: { 200: requestViewSchema, 404: t.Object({ error: t.String() }) },
  },
)
