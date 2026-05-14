import { Elysia, t } from 'elysia'
import { verifyBootstrap, isBootstrapActive } from '$lib/bootstrap'
import { signBootstrapJwt } from '$lib/jwt'
import { isProd } from '$lib/env'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'init-login' })

export default new Elysia()
  .post(
    '/',
    async ({ body, set, cookie }) => {
      if (!isBootstrapActive()) {
        set.status = 410
        return { error: 'setup_already_complete' }
      }
      const ok = await verifyBootstrap(body.email, body.password)
      if (!ok) {
        log.warn({ email: body.email }, 'bootstrap login failed')
        set.status = 401
        return { error: 'invalid_credentials' }
      }
      const jwt = await signBootstrapJwt()
      cookie.auth.set({
        value: jwt,
        httpOnly: true,
        secure: isProd(),
        maxAge: 3600,
        sameSite: 'lax',
        path: '/',
      })
      return { ok: true }
    },
    {
      detail: { tags: ['Auth'], summary: 'Bootstrap sign-in for the install wizard', operationId: 'initLogin' },
      body: t.Object({
        email: t.String(),
        password: t.String({ minLength: 1 }),
      }),
      response: {
        200: t.Object({ ok: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        410: t.Object({ error: t.String() }),
      },
    },
  )
