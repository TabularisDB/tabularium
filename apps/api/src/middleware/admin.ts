import { Elysia } from 'elysia'
import { db } from '$db'
import { verifyJwt } from '$lib/jwt'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'admin-middleware' })

export const adminMiddleware = new Elysia({ name: 'admin-middleware' }).derive(
  { as: 'scoped' },
  async ({ headers, cookie, set }) => {
    const authHeader = headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    const rawCookieValue = cookie.auth?.value
    const cookieToken = typeof rawCookieValue === 'string' ? rawCookieValue : undefined
    const token = bearerToken ?? cookieToken

    if (!token) {
      set.status = 401
      throw new Error('Unauthorized')
    }

    const jwtUser = await verifyJwt(token)
    if (!jwtUser) {
      set.status = 401
      throw new Error('Unauthorized')
    }

    const row = await db.query.users.findFirst({
      where: { id: jwtUser.sub },
      columns: { id: true, role: true, displayName: true },
    })
    if (!row || row.role !== 'admin') {
      log.warn({ userId: jwtUser.sub }, 'non-admin attempted admin route')
      set.status = 403
      throw new Error('Forbidden — admin only')
    }

    return { user: jwtUser, admin: row }
  },
)
