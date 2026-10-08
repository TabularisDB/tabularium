import { Elysia } from 'elysia'
import { rateLimit } from '$middleware/rate-limit'
import {
  oauthResponse,
  authorizationPage,
  authorizationDecision,
  registrationResponse,
  tokenResponse,
  revocationResponse,
  connectionsPage,
  revokeConnection,
} from '$lib/oauth/http'

export default new Elysia()
  .use(rateLimit({ bucket: 'oauth', limit: 120, windowSeconds: 60 }))
  .get('/authorize', ({ request }) => oauthResponse(() => authorizationPage(request)))
  .post('/authorize', ({ request }) => oauthResponse(() => authorizationDecision(request)), { parse: 'none' })
  .post('/register', ({ request }) => oauthResponse(() => registrationResponse(request)), { parse: 'none' })
  .post('/token', ({ request }) => oauthResponse(() => tokenResponse(request)), { parse: 'none' })
  .post('/revoke', ({ request }) => oauthResponse(() => revocationResponse(request)), { parse: 'none' })
  .get('/connections', ({ request }) => oauthResponse(() => connectionsPage(request)))
  .post('/connections', ({ request }) => oauthResponse(() => revokeConnection(request)), { parse: 'none' })
