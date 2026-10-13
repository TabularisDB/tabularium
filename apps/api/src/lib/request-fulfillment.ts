import { and, eq, inArray } from 'drizzle-orm'
import { db } from '$db'
import { pluginRequests } from '$db/schema'
import { logger } from '$lib/logger'
import { emitEvent, type EventActor } from '$lib/webhooks/events'

const log = logger.child({ module: 'request-fulfillment' })

/**
 * Close the request whose slug matches a plugin once that plugin is in the
 * catalog: approved, with a manifest ingested from a release. Called whenever
 * either condition may have just become true (approval, manifest applied).
 * The request keeps its votes and claims for history and moves to
 * `fulfilled`, linked to the plugin. Rejected and already fulfilled requests
 * are left alone. Never throws: fulfillment must not break the caller.
 */
export async function fulfillRequestForPlugin(pluginId: string, actor: EventActor = null): Promise<void> {
  try {
    const plugin = await db.query.plugins.findFirst({
      where: { id: pluginId },
      columns: { status: true, manifestVersion: true },
    })
    if (!plugin || plugin.status !== 'approved' || !plugin.manifestVersion) return
    const request = await db.query.pluginRequests.findFirst({ where: { slug: pluginId } })
    if (!request || (request.status !== 'approved' && request.status !== 'pending')) return
    const now = Date.now()
    await db
      .update(pluginRequests)
      .set({ status: 'fulfilled', fulfilledPluginId: pluginId, fulfilledAt: now, updatedAt: now })
      .where(and(eq(pluginRequests.id, request.id), inArray(pluginRequests.status, ['approved', 'pending'])))
    await emitEvent('request.fulfilled', {
      pluginId,
      actor,
      request: { ...request, status: 'fulfilled' },
    })
  } catch (err) {
    log.warn({ err, pluginId }, 'failed to fulfill matching plugin request')
  }
}
