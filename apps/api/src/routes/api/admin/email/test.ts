import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { sendEmail } from '$lib/email/facade'

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ body, set }) => {
    const out = await sendEmail({
      trigger: 'account.welcome',
      to: body.to,
      vars: { username: 'admin', baseUrl: 'https://tabularis.dev' },
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
    detail: {
      tags: ['Admin'],
      summary: 'Send a test email through the configured provider',
      operationId: 'sendTestEmail',
    },
    body: t.Object({ to: t.String({ minLength: 5 }), locale: t.Optional(t.String()) }),
    response: {
      200: t.Object({ ok: t.Boolean(), logId: t.String(), providerMid: t.String() }),
      412: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
    },
  },
)
