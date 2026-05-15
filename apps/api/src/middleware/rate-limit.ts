import { Elysia } from 'elysia'
import { cache } from '$lib/cache'
import { logger } from '$lib/logger'
import { getSetting, isSettingsInitialized } from '$lib/settings'

const log = logger.child({ module: 'rate-limit' })

function parseInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

function effectiveOpts(opts: RateLimitOptions): { limit: number; windowSeconds: number } {
  if (!isSettingsInitialized()) return { limit: opts.limit, windowSeconds: opts.windowSeconds }
  return {
    limit: parseInt(getSetting(`ratelimit.${opts.bucket}.limit`), opts.limit),
    windowSeconds: parseInt(getSetting(`ratelimit.${opts.bucket}.window`), opts.windowSeconds),
  }
}

export type RateLimitOptions = {
  bucket: string
  limit: number
  windowSeconds: number
  keyFn?: (ctx: { user?: { sub: string }; request: Request }) => string
}

function trustProxy(): boolean {
  if (!isSettingsInitialized()) return false
  return getSetting('infra.trust_proxy') === '1'
}

function clientIp(req: Request): string {
  if (trustProxy()) {
    const xff = req.headers.get('x-forwarded-for')
      ?.split(',').map((s) => s.trim()).filter(Boolean)
    if (xff?.length) return xff[xff.length - 1]
    const real = req.headers.get('x-real-ip')?.trim()
    if (real) return real
  }
  const addr = (req as unknown as {
    server?: { requestIP: (r: Request) => { address: string } | null }
  }).server?.requestIP?.(req)?.address
  return addr ?? 'unknown'
}

export function rateLimit(opts: RateLimitOptions) {
  const keyFn = opts.keyFn ?? (({ user, request }) => user?.sub ?? clientIp(request))

  return new Elysia()
    .onBeforeHandle({ as: 'scoped' }, async (ctx) => {
      // @ts-expect-error — user is contributed by authMiddleware when stacked before this; absent otherwise.
      const subject = keyFn({ user: ctx.user, request: ctx.request })
      const { limit, windowSeconds } = effectiveOpts(opts)
      const cacheKey = `ratelimit:${opts.bucket}:${subject}`

      try {
        const count = await cache().incr(cacheKey, windowSeconds)
        if (count > limit) {
          log.warn({ bucket: opts.bucket, subject, count, limit }, 'rate limit exceeded')
          return new Response(
            JSON.stringify({ error: `Rate limit exceeded — try again in ${windowSeconds}s` }),
            {
              status: 429,
              headers: {
                'content-type': 'application/json',
                'retry-after': String(windowSeconds),
              },
            },
          )
        }
      } catch (err) {
        log.error({ err, bucket: opts.bucket }, 'rate-limit incr failed — allowing request')
      }
    })
}
