import { Elysia } from 'elysia'
import { buildMergedSchema } from '$lib/manifest-schema'

export default new Elysia()
  .get('/', ({ set }) => {
    set.headers['content-type'] = 'application/schema+json; charset=utf-8'
    set.headers['cache-control'] = 'public, max-age=60'
    return buildMergedSchema()
  })
