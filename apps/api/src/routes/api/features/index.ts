import { Elysia, t } from 'elysia'
import { getFeatures } from '$lib/features'

export default new Elysia().get('/', () => getFeatures(), {
  detail: {
    tags: ['Plugins'],
    summary: 'Get public feature flags (submissions/requests on/off)',
    operationId: 'getFeatures',
  },
  response: {
    200: t.Object({
      submissionsEnabled: t.Boolean(),
      requestsEnabled: t.Boolean(),
    }),
  },
})
