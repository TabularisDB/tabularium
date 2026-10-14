import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { parseRepoUrl } from '$lib/providers'
import { getValidAccessToken, OAuthExpiredError } from '$lib/oauth-tokens'
import { inspectWebhook, type WebhookInspection } from '$lib/inspect-webhook'
import { env } from '$lib/env'

export default new Elysia().use(adminMiddleware).get(
  '/',
  async ({ params, set, admin }) => {
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

    // Returns null when the user has no usable token for this provider instance.
    async function inspectAs(userId: string): Promise<WebhookInspection | null> {
      const identity = await db.query.identities.findFirst({
        where: { userId, providerInstanceId: ref!.instance.id },
      })
      if (!identity?.accessToken) return null
      try {
        const token = await getValidAccessToken(identity, ref!.instance)
        return await inspectWebhook(token, ref!, webhookUrl)
      } catch (err) {
        if (!(err instanceof OAuthExpiredError)) throw err
        return null
      }
    }

    let checkedAs: 'owner' | 'admin' | null = null
    let inspection = await inspectAs(plugin.ownerId)
    if (inspection && inspection.status !== 'unknown') checkedAs = 'owner'
    else {
      inspection ??= {
        status: 'unknown',
        reason: 'The owner must link or re-link their provider account to check webhooks.',
        hooks: [],
      }
      // The owner's token may lack access (e.g. org OAuth app restrictions);
      // the reviewing admin may still be able to read the repository hooks.
      if (admin.id !== plugin.ownerId) {
        const fallback = await inspectAs(admin.id)
        if (fallback && fallback.status !== 'unknown') {
          inspection = fallback
          checkedAs = 'admin'
        } else {
          inspection.reason = `${inspection.reason} Your own linked account could not read them either.`
        }
      }
    }
    // Manual configuration remains available even if OAuth or provider
    // permissions prevent inspection. Reuse the secret that verifies ingress.
    return {
      ...inspection,
      checkedAs,
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
        "Inspects repository hooks using the owner's OAuth token, falling back to the calling admin's token when the owner's cannot read them. Returns the expected URL and existing plugin secret " +
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
        checkedAs: t.Nullable(t.Union([t.Literal('owner'), t.Literal('admin')])),
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
