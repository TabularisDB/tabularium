import { Elysia } from 'elysia'
import { verifyJwt } from '../lib/jwt'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'auth-middleware' })

export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .derive({ as: 'scoped' }, async ({ headers, cookie, set }) => {
    const authHeader = headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined
    const rawCookieValue = cookie.auth?.value
    const cookieToken = typeof rawCookieValue === 'string' ? rawCookieValue : undefined

    const token = bearerToken ?? cookieToken

    if (!token) {
      log.debug({ hasCookieHeader: !!headers.cookie }, 'no token')
      set.status = 401
      throw new Error('Unauthorized')
    }

    const user = await verifyJwt(token)
    if (!user) {
      log.warn('jwt verify failed')
      set.status = 401
      throw new Error('Unauthorized')
    }
    if (user.bootstrap) {
      log.warn({ sub: user.sub }, 'bootstrap token rejected in normal auth path')
      set.status = 401
      throw new Error('Unauthorized')
    }

    return { user }
  })
