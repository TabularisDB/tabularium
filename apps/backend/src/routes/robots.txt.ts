import { Elysia } from 'elysia'
import { getBranding } from '$lib/branding'

export default new Elysia()
  .get('/', ({ set }) => {
    const allow = getBranding().allowIndexing
    set.headers['content-type'] = 'text/plain; charset=utf-8'
    return allow ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n'
  })
