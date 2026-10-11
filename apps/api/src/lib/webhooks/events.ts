import { ulid } from 'ulid'
import { db } from '$db'
import { webhookDeliveries } from '$db/schema'
import { env } from '$lib/env'
import { getBranding } from '$lib/branding'
import { logger } from '$lib/logger'
import { scheduleDelivery } from './delivery'

const log = logger.child({ module: 'webhooks' })

export const WEBHOOK_EVENTS = [
  'plugin.submitted',
  'plugin.approved',
  'plugin.rejected',
  'release.published',
  'release.rejected',
  'release.yanked',
  'release.unyanked',
  'transfer.initiated',
  'transfer.accepted',
  'transfer.rejected',
  'transfer.cancelled',
  'request.created',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export function isWebhookEvent(v: string): v is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(v)
}

const META: Record<WebhookEvent, { title: string; color: number }> = {
  'plugin.submitted': { title: 'Plugin submitted', color: 0x3b82f6 },
  'plugin.approved': { title: 'Plugin approved', color: 0x22c55e },
  'plugin.rejected': { title: 'Plugin rejected', color: 0xef4444 },
  'release.published': { title: 'Release published', color: 0x8b5cf6 },
  'release.rejected': { title: 'Release rejected', color: 0xef4444 },
  'release.yanked': { title: 'Release yanked', color: 0xf59e0b },
  'release.unyanked': { title: 'Release restored', color: 0x22c55e },
  'transfer.initiated': { title: 'Ownership transfer requested', color: 0x06b6d4 },
  'transfer.accepted': { title: 'Ownership transfer accepted', color: 0x22c55e },
  'transfer.rejected': { title: 'Ownership transfer rejected', color: 0xef4444 },
  'transfer.cancelled': { title: 'Ownership transfer cancelled', color: 0x64748b },
  'request.created': { title: 'Plugin requested', color: 0x64748b },
}

export type EventActor = { id: string | null; name: string | null } | null

export type EventInput = {
  pluginId?: string
  actor?: EventActor
  reason?: string | null
  release?: { version: string; tag?: string | null }
  transfer?: { id: string; fromUserId: string; toUserId: string; message?: string | null; status: string }
  request?: { id: string; slug: string; name: string; description: string; kind?: string | null }
}

type UserRef = { id: string; displayName: string; username: string | null }

export type EventContext = {
  event: {
    id: string
    type: WebhookEvent
    title: string
    color: number
    occurredAt: number
    url: string
    reason: string | null
    actor: EventActor
  }
  registry: { name: string; url: string; adminUrl: string }
  subject: { kind: 'plugin' | 'request'; id: string; name: string; description: string; url: string }
  plugin?: {
    id: string
    name: string
    description: string
    status: string
    rejectionReason: string | null
    latestVersion: string | null
    repoUrl: string
    homepage: string | null
    supportEmail: string | null
    category: string | null
    url: string
  }
  owner?: UserRef
  release?: { version: string; tag: string | null; url: string }
  transfer?: { id: string; status: string; message: string | null; from: UserRef | null; to: UserRef | null }
  request?: { id: string; slug: string; name: string; description: string; kind: string | null; url: string }
}

export function webBaseUrl(): string {
  return (env.WEB_BASE_URL ?? env.BASE_URL).replace(/\/$/, '')
}

async function loadUser(id: string): Promise<UserRef | null> {
  const user = await db.query.users.findFirst({ where: { id }, columns: { id: true, displayName: true } })
  if (!user) return null
  const identity = await db.query.identities.findFirst({ where: { userId: id }, columns: { username: true } })
  return { id: user.id, displayName: user.displayName, username: identity?.username ?? null }
}

export async function buildContext(type: WebhookEvent, input: EventInput): Promise<EventContext> {
  const base = webBaseUrl()
  const meta = META[type]
  const ctx: EventContext = {
    event: {
      id: ulid(),
      type,
      title: meta.title,
      color: meta.color,
      occurredAt: Date.now(),
      url: base,
      reason: input.reason ?? null,
      actor: input.actor ?? null,
    },
    registry: { name: getBranding().name, url: base, adminUrl: `${base}/admin` },
    subject: { kind: 'plugin', id: '', name: '', description: '', url: base },
  }

  if (input.pluginId) {
    const p = await db.query.plugins.findFirst({ where: { id: input.pluginId } })
    if (p) {
      const url = `${base}/plugins/${encodeURIComponent(p.id)}`
      ctx.plugin = {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        rejectionReason: p.rejectionReason ?? null,
        latestVersion: p.latestVersion ?? null,
        repoUrl: p.repoUrl,
        homepage: p.homepage ?? null,
        supportEmail: p.supportEmail ?? null,
        category: p.category ?? null,
        url,
      }
      ctx.subject = { kind: 'plugin', id: p.id, name: p.name, description: p.description, url }
      ctx.event.url = p.status === 'pending' ? `${base}/admin/plugins` : url
      ctx.owner = (await loadUser(p.ownerId)) ?? undefined
    }
  }

  if (input.release) {
    ctx.release = {
      version: input.release.version,
      tag: input.release.tag ?? null,
      url: ctx.plugin?.url ?? base,
    }
  }

  if (input.transfer) {
    const t = input.transfer
    ctx.transfer = {
      id: t.id,
      status: t.status,
      message: t.message ?? null,
      from: await loadUser(t.fromUserId),
      to: await loadUser(t.toUserId),
    }
  }

  if (input.request) {
    const r = input.request
    const url = `${base}/requests`
    ctx.request = { id: r.id, slug: r.slug, name: r.name, description: r.description, kind: r.kind ?? null, url }
    ctx.subject = { kind: 'request', id: r.id, name: r.name, description: r.description, url }
    ctx.event.url = url
  }

  ctx.event.title = ctx.subject.name ? `${meta.title}: ${ctx.subject.name}` : meta.title
  return ctx
}

export function subscribes(eventsJson: string, type: string): boolean {
  try {
    const events = JSON.parse(eventsJson) as unknown
    return Array.isArray(events) && (events.includes('*') || events.includes(type))
  } catch {
    return false
  }
}

// Fan an event out to every enabled webhook subscribed to it. Never throws:
// a notification failure must not break the action that triggered it.
export async function emitEvent(type: WebhookEvent, input: EventInput = {}): Promise<void> {
  try {
    const hooks = (await db.query.webhooks.findMany({ where: { enabled: 1 } })).filter((h) =>
      subscribes(h.events, type),
    )
    if (hooks.length === 0) return
    const ctx = await buildContext(type, input)
    const payload = JSON.stringify(ctx)
    const now = Date.now()
    for (const hook of hooks) {
      const id = ulid()
      await db.insert(webhookDeliveries).values({
        id,
        webhookId: hook.id,
        event: type,
        payload,
        status: 'pending',
        nextAttemptAt: now,
        createdAt: now,
      })
      scheduleDelivery(id)
    }
  } catch (err) {
    log.error({ err, type }, 'failed to enqueue webhook event')
  }
}

// Sample context for previews and "send test" — real registry values, fake subject.
export function sampleContext(type: WebhookEvent): EventContext {
  const base = webBaseUrl()
  const meta = META[type]
  const isRequest = type === 'request.created'
  const url = isRequest ? `${base}/requests` : `${base}/plugins/example-plugin`
  const owner = { id: '01EXAMPLEOWNER', displayName: 'Jane Doe', username: 'janedoe' }
  const ctx: EventContext = {
    event: {
      id: ulid(),
      type,
      title: `${meta.title}: Example Plugin`,
      color: meta.color,
      occurredAt: Date.now(),
      url,
      reason: type.endsWith('.rejected') || type === 'release.yanked' ? 'Example reason provided by an admin' : null,
      actor: { id: '01EXAMPLEADMIN', name: 'admin' },
    },
    registry: { name: getBranding().name, url: base, adminUrl: `${base}/admin` },
    subject: {
      kind: isRequest ? 'request' : 'plugin',
      id: 'example-plugin',
      name: 'Example Plugin',
      description: 'A sample plugin used to preview webhook templates.',
      url,
    },
  }
  if (isRequest) {
    ctx.request = {
      id: '01EXAMPLEREQUEST',
      slug: 'example-plugin',
      name: 'Example Plugin',
      description: 'A sample plugin used to preview webhook templates.',
      kind: null,
      url,
    }
    return ctx
  }
  ctx.plugin = {
    id: 'example-plugin',
    name: 'Example Plugin',
    description: 'A sample plugin used to preview webhook templates.',
    status: type === 'plugin.rejected' ? 'rejected' : type === 'plugin.submitted' ? 'pending' : 'approved',
    rejectionReason: type === 'plugin.rejected' ? 'Example reason provided by an admin' : null,
    latestVersion: '1.2.0',
    repoUrl: 'https://github.com/janedoe/example-plugin',
    homepage: 'https://github.com/janedoe/example-plugin',
    supportEmail: 'support@example.com',
    category: null,
    url,
  }
  ctx.owner = owner
  if (type.startsWith('release.')) ctx.release = { version: '1.2.0', tag: 'v1.2.0', url }
  if (type.startsWith('transfer.')) {
    ctx.transfer = {
      id: '01EXAMPLETRANSFER',
      status: type.split('.')[1] === 'initiated' ? 'pending' : type.split('.')[1],
      message: 'Handing this over to the new maintainer.',
      from: owner,
      to: { id: '01EXAMPLENEWOWNER', displayName: 'John Roe', username: 'johnroe' },
    }
  }
  return ctx
}
