import { db } from '$db'
import { parseRepoUrl } from '$lib/providers'
import { getValidAccessToken, OAuthExpiredError, UpstreamUnauthorizedError, reauthErrorBody } from '$lib/oauth-tokens'
import { resolveManifest, rawContentBase } from '$lib/manifest'
import { manifestPatch, applyManifestToPlugin } from '$lib/manifest-apply'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'

export type RefreshOk = { ok: true; slug: string; source: string; ref: string }
export type RefreshErr = {
  status: number
  body: { error: string; reauthFor?: string }
}

// Shared refresh path for the author + admin endpoints. Returns an Ok result
// when the manifest applied cleanly, or a (status, body) tuple to surface to
// the route handler. The route is responsible for ownership/role checks + audit.
export async function refreshManifestForPlugin(
  plugin: { id: string; ownerId: string; repoUrl: string; latestVersion: string | null },
  options: { branch?: string },
): Promise<RefreshOk | RefreshErr> {
  const ref = parseRepoUrl(plugin.repoUrl)
  if (!ref) {
    return { status: 422, body: { error: 'Repo URL no longer parses to a configured provider instance' } }
  }
  const ownerIdentity = await db.query.identities.findFirst({
    where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
  })
  if (!ownerIdentity?.accessToken) {
    return { status: 412, body: { error: 'No stored access token for owner — owner must re-link their provider account' } }
  }
  let token: string
  try {
    token = await getValidAccessToken(ownerIdentity, ref.instance)
  } catch (e) {
    if (e instanceof OAuthExpiredError) return { status: 401, body: reauthErrorBody(e) }
    throw e
  }
  const branch = options.branch ?? plugin.latestVersion ?? 'HEAD'
  let manifest
  try {
    manifest = await resolveManifest(token, ref, { ref: branch })
  } catch (e) {
    if (e instanceof UpstreamUnauthorizedError) return { status: 401, body: reauthErrorBody(e) }
    throw e
  }
  if (!manifest) {
    return { status: 404, body: { error: `No .tabularium file found in ${plugin.repoUrl} @ ${branch}` } }
  }
  const patch = manifestPatch(manifest, { repoBase: rawContentBase(ref, branch), version: branch })
  await applyManifestToPlugin(plugin.id, patch)
  await cache().del(latestCacheKey(plugin.id))
  return { ok: true, slug: plugin.id, source: manifest.source, ref: branch }
}
