import { ulid } from 'ulid'
import { db } from '../db'
import { auditLog } from '../db/schema'
import { logger } from './logger'

const log = logger.child({ module: 'audit' })

export type AuditEntry = {
  actorId?: string | null
  actorName?: string | null
  action: string
  target?: string | null
  meta?: Record<string, unknown> | null
  ip?: string | null
}

export function actorFromAdmin(admin: { id: string; displayName: string }, request: Request): Pick<AuditEntry, 'actorId' | 'actorName' | 'ip'> {
  return {
    actorId: admin.id,
    actorName: admin.displayName,
    ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
  }
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: ulid(),
      actorId: entry.actorId ?? null,
      actorName: entry.actorName ?? null,
      action: entry.action,
      target: entry.target ?? null,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
      ip: entry.ip ?? null,
    })
  } catch (err) {
    log.warn({ err, action: entry.action }, 'audit write failed')
  }
}
