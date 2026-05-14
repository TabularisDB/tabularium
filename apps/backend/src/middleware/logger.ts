import { Elysia } from 'elysia'
import { ulid } from 'ulid'
import { logger } from '../lib/logger'

export const loggerMiddleware = new Elysia({ name: 'logger-middleware' })
  .derive({ as: 'global' }, ({ request }) => {
    const reqId = ulid().slice(-8)
    const url = new URL(request.url)
    const log = logger.child({
      reqId,
      method: request.method,
      path: url.pathname,
    })
    return { log, _reqStart: performance.now() }
  })
  .onAfterResponse({ as: 'global' }, ({ log, _reqStart, set }) => {
    const durationMs = Math.round(performance.now() - _reqStart)
    const status = typeof set.status === 'number' ? set.status : 200
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    log[level]({ status, durationMs }, 'request')
  })
  .onError({ as: 'global' }, ({ log, error, code, set }) => {
    if (code === 'NOT_FOUND') return
    const status = typeof set.status === 'number' ? set.status : 500
    log?.error({ err: error, code, status }, 'request error')
  })
