import { delegatedAccess, allowsScope } from '$lib/access'
import { Elysia } from 'elysia'
import { verifyPublisherToken, type VerifiedPublisherToken } from '$lib/publisher-tokens'

export const publisherTokenMiddleware = new Elysia({ name: 'publisher-token-middleware' }).derive(
  { as: 'scoped' },
  async ({ headers, set, request }) => {
    const access = delegatedAccess(request)
    if (access) {
      if (!allowsScope(access.scopes, 'plugins:write')) {
        set.status = 403
        throw new Error('Forbidden — insufficient scope')
      }
      return {
        publisher: {
          id: access.grantId,
          userId: access.user.sub,
          scopes: ['publish:*', 'yank:*'],
        } satisfies VerifiedPublisherToken,
      }
    }
    const authHeader = headers.authorization
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    if (!bearer) {
      set.status = 401
      throw new Error('Unauthorized — Authorization: Bearer <publisher token>')
    }
    const verified = await verifyPublisherToken(bearer)
    if (!verified) {
      set.status = 401
      throw new Error('Unauthorized — invalid or revoked publisher token')
    }
    return { publisher: verified satisfies VerifiedPublisherToken }
  },
)
