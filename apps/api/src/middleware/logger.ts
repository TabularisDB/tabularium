import { Elysia } from 'elysia'
import { ulid } from 'ulid'
import { logger } from '$lib/logger'

// k8s/docker probes hit /healthz every ~10s — logging every roundtrip drowns the signal.
const SILENT_PATHS = new Set(['/healthz'])

export const loggerMiddleware = new Elysia({ name: 'logger-middleware' })
  .derive({ as: 'global' }, ({ request }) => {
    const reqId = ulid().slice(-8)
    const url = new URL(request.url)
    const silent = SILENT_PATHS.has(url.pathname)
    const log = logger.child({
      reqId,
      method: request.method,
      path: url.pathname,
    })
    return { log, _reqStart: performance.now(), _silentReq: silent }
  })
  .onAfterResponse({ as: 'global' }, ({ log, _reqStart, _silentReq, set }) => {
    if (!log || _silentReq) return
    const durationMs = _reqStart ? Math.round(performance.now() - _reqStart) : 0
    const status = typeof set.status === 'number' ? set.status : 200
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    log[level]({ status, durationMs }, 'request')
  })
  .onError({ as: 'global' }, ({ log, error, code, set, _silentReq }) => {
    if (code === 'NOT_FOUND') return
    if (_silentReq) return
    const status = typeof set.status === 'number' ? set.status : 500
    log?.error({ err: error, code, status }, 'request error')
  })
