import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { emailSuppression } from '$db/schema'
import { recordAudit } from '$lib/audit'
import { getUpstreamDriver } from '$lib/email/suppression-driver'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'admin-suppression' })

export default new Elysia()
  .use(adminMiddleware)
  .delete(
    '/',
    async ({ params, admin, request, set }) => {
      const email = decodeURIComponent(params.email).toLowerCase()
      const existing = await db.query.emailSuppression.findFirst({ where: { email } })
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
          log.warn({ err, email }, 'upstream suppression remove failed — proceeding with local removal')
        }
      }
      await db.delete(emailSuppression).where(eq(emailSuppression.email, email))
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
