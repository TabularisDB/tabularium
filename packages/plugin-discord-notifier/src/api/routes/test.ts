import { Elysia, t } from 'elysia'
import { host } from '../host-handles'
import { sendDiscordWebhook } from '../webhook'

export default function buildTestRoute() {
  return (
    new Elysia()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(host().middleware.admin as any)
      .post(
        '/',
        async ({ set }) => {
          const out = await sendDiscordWebhook(
            {
              content:
                ':test_tube: Tabularium discord-notifier test — if you see this, your webhook works.',
            },
            'test',
          )
          if (out.status === 'sent') {
            return { ok: true, status: 'sent', httpStatus: out.httpStatus ?? 0 }
          }
          if (out.status === 'skipped') {
            set.status = 412
            return { error: out.error ?? 'skipped' }
          }
          set.status = 422
          return { error: out.error ?? 'failed' }
        },
        {
          detail: {
            tags: ['Admin'],
            summary: 'Send a test message through the Discord webhook',
            operationId: 'sendDiscordNotifierTest',
          },
          response: {
            200: t.Object({
              ok: t.Boolean(),
              status: t.Literal('sent'),
              httpStatus: t.Number(),
            }),
            412: t.Object({ error: t.String() }),
            422: t.Object({ error: t.String() }),
          },
        },
      )
  )
}
