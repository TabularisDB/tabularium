import { Elysia, t } from 'elysia'
import { authMiddleware } from '../../middleware/auth'

const meSchema = t.Object({
  id: t.String(),
  username: t.String(),
  provider: t.String(),
  providerInstanceUrl: t.Nullable(t.String()),
})

export default new Elysia()
  .use(authMiddleware)
  .get('/', ({ user }) => ({
    id: user.sub,
    username: user.username,
    provider: user.provider,
    providerInstanceUrl: user.providerInstanceUrl,
  }), {
    detail: { tags: ['Auth'] },
    response: { 200: meSchema },
  })
