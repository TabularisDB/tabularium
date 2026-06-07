import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '../../../../../../../apps/api/src/middleware/admin'
import { recordAudit } from '../../../../../../../apps/api/src/lib/audit'
import { db, schema } from '../../../db'
import { getUpstreamDriver } from '../../../suppression-driver'
import { log as makeLog } from '../../../logger'

const log = makeLog('admin-suppression')

export default new Elysia()
  .use(adminMiddleware)
  .delete(
    '/',
    async ({ params, admin, request, set }) => {
      const email = decodeURIComponent(params.email).toLowerCase()
      const existing = await db().query.emailSuppression.findFirst({ where: { email } })
      if (!existing) {
        set.status = 404
        return { error: 'Suppression not found' }
      }
      const driver = getUpstreamDriver()
      let upstreamSynced = false
      let upstreamError: string | null = null
      if (driver) {
        try {
          await driver.remove(email)
          upstreamSynced = true
        } catch (err) {
          upstreamError = err instanceof Error ? err.message : 'unknown'
          log.warn('upstream suppression remove failed — proceeding with local removal', { err, email })
        }
      }
      await db().delete(schema.emailSuppression).where(eq(schema.emailSuppression.email, email))
      await recordAudit({
        actorId: admin.id,
        actorName: admin.displayName,
        action: 'email.suppression_remove',
        target: `email:${email}`,
        meta: { previousSource: existing.source, upstreamSynced, upstreamError },
        ip: request.headers.get('x-forwarded-for') ?? null,
      })
      return { ok: true, upstreamSynced }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Remove an email from the suppression list',
        operationId: 'removeSuppression',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ email: t.String() }),
      response: {
        200: t.Object({ ok: t.Boolean(), upstreamSynced: t.Boolean() }),
        404: t.Object({ error: t.String() }),
      },
    },
  )
