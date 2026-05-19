import { Elysia } from 'elysia'
import { verifyJwt } from '$lib/jwt'
import { isBootstrapActive } from '$lib/bootstrap'

export const bootstrapAuthMiddleware = new Elysia({ name: 'bootstrap-auth' }).derive(
  { as: 'scoped' },
  async ({ headers, cookie, set }) => {
    const bearer = headers.authorization?.startsWith('Bearer ') ? headers.authorization.slice(7) : undefined
    const cookieToken = typeof cookie.auth?.value === 'string' ? cookie.auth.value : undefined
    const token = bearer ?? cookieToken

    if (!token || !isBootstrapActive()) {
      set.status = 401
      throw new Error('Unauthorized')
    }
    const payload = await verifyJwt(token)
    if (!payload?.bootstrap) {
      set.status = 401
      throw new Error('Unauthorized')
    }
    return { bootstrap: true as const }
  },
)
