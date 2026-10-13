import { Elysia, t } from 'elysia'
import { safeReturnTo } from '$lib/return-to'
import { webBaseUrl } from '$lib/webhooks/events'

// Lets the web app send an already signed-in user back to a trusted external
// site (it cannot check ALLOWED_ORIGINS itself). Untrusted targets go home.
export default new Elysia().get(
  '/',
  ({ query, redirect }) => {
    const target = safeReturnTo(query.to)
    if (!target) return redirect(`${webBaseUrl()}/`, 302)
    return redirect(target.startsWith('/') ? `${webBaseUrl()}${target}` : target, 302)
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'Redirect to a trusted return URL',
      description:
        'Redirects to `to` when it is a path on the web app or a URL on an allowed origin (`ALLOWED_ORIGINS`), otherwise to the home page. Used after sign-in when the user is already authenticated.',
      operationId: 'authReturn',
    },
    query: t.Object({ to: t.Optional(t.String({ maxLength: 512 })) }),
  },
)
