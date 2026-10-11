import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { parseRepoUrl } from '$lib/providers'
import { getValidAccessToken, OAuthExpiredError } from '$lib/oauth-tokens'
import { inspectWebhook, type WebhookInspection } from '$lib/inspect-webhook'
import { env } from '$lib/env'

export default new Elysia().use(adminMiddleware).get(
  '/',
  async ({ params, set }) => {
    // This response contains the plugin's signing secret for manual setup.
    set.headers['cache-control'] = 'no-store'
    const plugin = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    const ref = parseRepoUrl(plugin.repoUrl)
    if (!ref) {
      set.status = 422
      return { error: 'Repo URL no longer parses to a configured provider instance' }
    }
    const webhookUrl = `${env.BASE_URL.replace(/\/$/, '')}/api/webhooks/release`
    const repoUrl = `${ref.instance.baseUrl}/${ref.fullName}`
    const ownerIdentity = await db.query.identities.findFirst({
      where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
    })
    let inspection: WebhookInspection = {
      status: 'unknown',
      reason: 'No stored access token for the owner. Re-link their provider account to check webhooks.',
      hooks: [],
    }
    if (ownerIdentity?.accessToken) {
      try {
        const token = await getValidAccessToken(ownerIdentity, ref.instance)
        inspection = await inspectWebhook(token, ref, webhookUrl)
      } catch (err) {
        if (!(err instanceof OAuthExpiredError)) throw err
        inspection.reason = 'The owner must re-link their provider account to check webhooks.'
      }
    }
    // Manual configuration remains available even if OAuth or provider
    // permissions prevent inspection. Reuse the secret that verifies ingress.
    return {
      ...inspection,
      webhookUrl,
      webhookSecret: plugin.webhookSecret,
      provider: ref.instance.displayName,
      settingsUrl: `${repoUrl}/${ref.instance.kind === 'gitlab' ? '-/hooks' : 'settings/hooks'}`,
      contentType: 'application/json',
      events: ['release'],
    }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Check the repository release webhook and retrieve manual setup details',
      description:
        "Inspects repository hooks using the owner's OAuth token. Returns the expected URL and existing plugin secret " +
        'even when the provider check is unavailable. The provider does not reveal the configured secret, so it cannot be compared.',
      operationId: 'adminGetPluginWebhook',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({
        status: t.Union([
          t.Literal('configured'),
          t.Literal('missing'),
          t.Literal('misconfigured'),
          t.Literal('unknown'),
        ]),
        reason: t.Nullable(t.String()),
        hooks: t.Array(
          t.Object({
            id: t.Number(),
            active: t.Boolean(),
            releaseEvents: t.Boolean(),
            contentType: t.Nullable(t.String()),
          }),
        ),
        webhookUrl: t.String(),
        webhookSecret: t.String(),
        provider: t.String(),
        settingsUrl: t.String(),
        contentType: t.String(),
        events: t.Array(t.String()),
      }),
      404: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
    },
  },
)
