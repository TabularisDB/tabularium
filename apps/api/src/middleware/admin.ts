import { Elysia } from 'elysia'
import { db } from '$db'
import { verifyJwt } from '$lib/jwt'
import { logger } from '$lib/logger'
import { isApiToken, verifyAdminToken } from '$lib/admin-tokens'

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

    // Long-lived API tokens take a different code path — they don't carry
    // JWT claims, just a userId and an optional scope list.
    if (isApiToken(token)) {
      const verified = await verifyAdminToken(token)
      if (!verified) {
        set.status = 401
        throw new Error('Unauthorized — invalid or revoked API token')
      }
      const row = await db.query.users.findFirst({
        where: { id: verified.userId },
        columns: { id: true, role: true, displayName: true },
      })
      if (!row || row.role !== 'admin') {
        log.warn({ userId: verified.userId, tokenId: verified.id }, 'API token bound to non-admin user')
        set.status = 403
        throw new Error('Forbidden — admin only')
      }
      const fauxJwt = { sub: row.id, role: 'admin' as const, kind: 'admin_token' as const }
      return { user: fauxJwt, admin: row, apiToken: { id: verified.id, scopes: verified.scopes } }
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

    return { user: jwtUser, admin: row, apiToken: null as null | { id: string; scopes: string[] | null } }
  },
)
