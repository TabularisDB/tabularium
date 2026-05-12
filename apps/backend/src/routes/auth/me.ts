import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth'

export default new Elysia()
  .use(authMiddleware)
  .get('/auth/me', ({ user }) => ({
    id: user.sub,
    username: user.username,
    provider: user.provider,
    providerInstanceUrl: user.providerInstanceUrl,
  }))
