import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'admin-infra-restart' })

/**
 * Operator-triggered restart of the API process.
 *
 * Most plugin lifecycle changes (enable/disable, infra.plugins.* settings
 * tweaks) only take effect on next boot because the loader doesn't yet do
 * runtime unmounts. This endpoint gives operators a one-click way to apply
 * those changes without leaving the admin panel — process.exit(0) after the
 * response lets k8s/Tilt respawn the pod.
 *
 * Running this outside of k8s/Tilt (raw `bun run dev`) will exit the process
 * without a supervisor restart — operators outside orchestrated envs should
 * not call this.
 */
export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ admin, request }) => {
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'infra.restart',
      target: null,
      meta: { reason: 'operator-triggered' },
    })
    log.warn('operator-triggered restart — exiting process')
    // Delay exit so the HTTP response can flush before the listener tears down.
    // 50ms is enough for Elysia to write the body and close the socket.
    setTimeout(() => {
      process.exit(0)
    }, 50)
    return { ok: true, restartingIn: 50 }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Restart the API process so plugin lifecycle changes apply',
      description:
        'Schedules process.exit(0) 50ms after returning so k8s/Tilt respawns the pod. Used to apply enable/disable changes that the loader can only honour on next boot.',
      operationId: 'restartInfra',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({ ok: t.Boolean(), restartingIn: t.Number() }),
    },
  },
)
