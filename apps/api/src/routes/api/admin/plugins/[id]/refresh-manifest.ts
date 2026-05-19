import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { parseRepoUrl } from '$lib/providers'
import { getValidAccessToken, OAuthExpiredError, reauthErrorBody } from '$lib/oauth-tokens'
import { resolveManifest, rawContentBase } from '$lib/manifest'
import { manifestPatch, applyManifestToPlugin } from '$lib/manifest-apply'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, body, set, admin, request }) => {
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
    const ownerIdentity = await db.query.identities.findFirst({
      where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
    })
    if (!ownerIdentity?.accessToken) {
      set.status = 412
      return { error: 'No stored access token for owner — owner must re-link their provider account' }
    }
    let token: string
    try {
      token = await getValidAccessToken(ownerIdentity, ref.instance)
    } catch (e) {
      if (e instanceof OAuthExpiredError) {
        set.status = 401
        return reauthErrorBody(e)
      }
      throw e
    }
    const branch = body?.ref ?? plugin.latestVersion ?? 'HEAD'
    const manifest = await resolveManifest(token, ref, { ref: branch })
    if (!manifest) {
      set.status = 404
      return { error: `No .tabularium file found in ${plugin.repoUrl} @ ${branch}` }
    }
    const patch = manifestPatch(manifest, {
      repoBase: rawContentBase(ref, branch),
      version: branch,
    })
    await applyManifestToPlugin(plugin.id, patch)
    await cache().del(latestCacheKey(plugin.id))
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'plugin.refresh_manifest',
      target: `plugin:${plugin.id}`,
      meta: { ref: branch, source: manifest.source },
    })
    return { ok: true, slug: plugin.id, source: manifest.source, ref: branch }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Re-fetch the .tabularium manifest from the repo',
      description:
        'Pulls `.tabularium` (and the README) from the repo at the given ref (defaults to the latest released tag or HEAD).',
      operationId: 'refreshPluginManifest',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    body: t.Optional(t.Object({ ref: t.Optional(t.String()) })),
    response: {
      200: t.Object({ ok: t.Boolean(), slug: t.String(), source: t.String(), ref: t.String() }),
      401: t.Object({ error: t.String(), reauthFor: t.String() }),
      404: t.Object({ error: t.String() }),
      412: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
    },
  },
)
