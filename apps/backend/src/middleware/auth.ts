import { Elysia } from 'elysia'
import { verifyJwt } from '../lib/jwt'

export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .derive({ as: 'scoped' }, async ({ headers, cookie, set }) => {
    const authHeader = headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined
    const cookieToken = cookie.auth?.value

    const token = bearerToken ?? cookieToken

    if (!token) {
      set.status = 401
      throw new Error('Unauthorized')
    }

    const user = await verifyJwt(token)
    if (!user) {
      set.status = 401
      throw new Error('Unauthorized')
    }

    return { user }
  })
