import { Elysia } from 'elysia'
import { verifyJwt } from '$lib/jwt'
import { touchSession } from '$lib/sessions'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'auth-middleware' })

export const authMiddleware = new Elysia({ name: 'auth-middleware' }).derive(
  { as: 'scoped' },
  async ({ headers, cookie, set }) => {
    const authHeader = headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
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
    // Token signed by us — make sure its session hasn't been revoked since
    // (logout, password change, admin kick). Bootstrap tokens skip this lookup.
    if (user.jti && !(await touchSession(user.jti))) {
      log.info({ sub: user.sub, jti: user.jti }, 'session revoked')
      set.status = 401
      throw new Error('Session revoked')
    }

    return { user }
  },
)
