import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getInstance, type ProviderInstance } from '$lib/provider-instance'
import { recordAudit, actorFromAdmin } from '$lib/audit'

function authorizeUrlFor(inst: ProviderInstance): string {
  // GitLab uses /oauth/authorize; GitHub and Gitea/Forgejo both use /login/oauth/authorize.
  if (inst.kind === 'gitlab') return `${inst.baseUrl}/oauth/authorize`
  return `${inst.baseUrl}/login/oauth/authorize`
}

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, set, admin, request }) => {
    const inst = getInstance(params.id)
    if (!inst) {
      set.status = 404
      return { error: 'Instance not found' }
    }

    const target = authorizeUrlFor(inst)
    let ok = false
    let status = 0
    let error: string | undefined

    try {
      // Use GET with redirect: 'manual' so a 302 → /login page counts as a healthy
      // discovery hit (the OAuth endpoint exists and is responding). HEAD is unreliable
      // for these endpoints — Gitea and some GitLab versions return 405 for HEAD.
      const res = await fetch(target, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'text/html', 'User-Agent': 'tabularium/1.0 (oauth-discovery)' },
        signal: AbortSignal.timeout(5000),
      })
      status = res.status
      // Anything in the 2xx / 3xx / 4xx range proves the endpoint is reachable.
      // 5xx is the only thing we treat as broken; a real OAuth call with no params
      // typically lands at 302 (redirect to login) or 400 (missing client_id).
      ok = status >= 200 && status < 500
    } catch (e) {
      error = e instanceof Error ? e.message : 'fetch failed'
    }

    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'provider_instance.test_oauth',
      target: `provider_instance:${inst.id}`,
      meta: { ok, status, error: error ?? null, url: target },
    })

    return { ok, status, error }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Probe the OAuth authorize endpoint for a provider instance',
      description:
        'Issues a GET (manual redirect, 5s timeout) against the provider-kind specific authorize URL. ' +
        'A 302/400 typically means "configured correctly". 5xx or fetch errors are reported as not-ok. ' +
        'Records an audit entry with the outcome.',
      operationId: 'testProviderOAuth',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({
        ok: t.Boolean(),
        status: t.Number(),
        error: t.Optional(t.String()),
      }),
      404: t.Object({ error: t.String() }),
    },
  },
)
