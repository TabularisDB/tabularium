import { Elysia, t } from 'elysia'
import { buildMergedSchema } from '$lib/manifest-schema'

export default new Elysia().get(
  '/',
  ({ set, query }) => {
    set.headers['content-type'] = 'application/schema+json; charset=utf-8'
    set.headers['cache-control'] = 'public, max-age=60'
    const kind = typeof query.kind === 'string' && query.kind.length > 0 ? query.kind : null
    return buildMergedSchema({ kind })
  },
  {
    query: t.Object({ kind: t.Optional(t.String({ maxLength: 40 })) }),
  },
)
