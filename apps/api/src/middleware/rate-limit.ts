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

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
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
