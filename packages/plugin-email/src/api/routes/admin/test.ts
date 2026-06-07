import { Elysia, t } from 'elysia'
import { host } from '../../host-handles'
import { sendEmail } from '../../facade'

type AdminCtxBase = {
  admin: { id: string; displayName: string | null }
  user: { sub: string; username?: string; role?: string }
  apiToken: { id: string; scopes: string[] | null } | null
}

export default function buildTestRoute() {
  // The Elysia plugin coming out of `host().middleware.admin` carries its own
  // `.derive` types in the kernel, but the host-types interface erases them
  // to `unknown`. We restore the derives via the explicit Elysia generic on
  // the chained instance so handler contexts pick up `admin`/`user`.
  const base = new Elysia() as Elysia<
    '',
    { decorator: AdminCtxBase; store: {}; derive: AdminCtxBase; resolve: {} }
  >
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return base.use(host().middleware.admin as any).post(
    '/',
    async ({ body, set }) => {
      const out = await sendEmail({
        trigger: 'account.welcome',
        to: body.to,
        vars: { username: 'admin', baseUrl: host().env.BASE_URL },
        locale: body.locale ?? 'en',
        force: true,
      })
      if (out.status === 'sent') return { ok: true, logId: out.logId, providerMid: out.providerMid ?? '' }
      if (out.status === 'queued') {
        set.status = 412
        return { error: 'No email provider is configured yet — save settings first.' }
      }
      set.status = 422
      return { error: out.status === 'failed' ? out.error : `unexpected status ${out.status}` }
    },
    {
      detail: { tags: ['Admin'], summary: 'Send a test email through the configured provider', operationId: 'sendTestEmail' },
      body: t.Object({ to: t.String({ minLength: 5 }), locale: t.Optional(t.String()) }),
      response: {
        200: t.Object({ ok: t.Boolean(), logId: t.String(), providerMid: t.String() }),
        412: t.Object({ error: t.String() }),
        422: t.Object({ error: t.String() }),
      },
    },
  )
}
