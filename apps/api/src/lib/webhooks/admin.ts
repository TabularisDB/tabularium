// Validation + (de)serialization for the admin webhook endpoints. Secret
// values never leave the server: responses only carry secret names.

import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { db } from '$db'
import { type webhookDeliveries, webhooks } from '$db/schema'
import { encryptToken } from '$lib/crypto'
import { decodeSecrets, parseHeaders, type HeaderTemplate, type WebhookRow } from './delivery'
import { isWebhookEvent } from './events'
import { getPreset } from './presets'
import { TemplateError, validateTemplate } from './template'

export class WebhookInputError extends Error {}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/
const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/
const MAX_HEADERS = 30
const MAX_SECRETS = 20

export type WebhookInput = {
  name?: string
  enabled?: boolean
  preset?: string | null
  events?: string[]
  method?: string
  url?: string
  headers?: HeaderTemplate[]
  body?: string | null
  contentType?: string
  // Merge semantics: a string sets/replaces, null removes the key.
  secrets?: Record<string, string | null>
  signingSecret?: string | null
}

export type WebhookView = {
  id: string
  name: string
  enabled: boolean
  preset: string | null
  events: string[]
  method: string
  url: string
  headers: HeaderTemplate[]
  body: string | null
  contentType: string
  secretNames: string[]
  hasSigningSecret: boolean
  createdAt: number
  updatedAt: number
}

export function toView(row: WebhookRow): WebhookView {
  let events: string[] = []
  try {
    events = JSON.parse(row.events) as string[]
  } catch {}
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    preset: row.preset ?? null,
    events,
    method: row.method,
    url: row.url,
    headers: parseHeaders(row.headers),
    body: row.body ?? null,
    contentType: row.contentType,
    secretNames: Object.keys(decodeSecrets(row)).sort(),
    hasSigningSecret: !!row.signingSecret,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function checkTemplate(field: string, src: string) {
  try {
    validateTemplate(src)
  } catch (err) {
    if (err instanceof TemplateError) throw new WebhookInputError(`${field}: ${err.message}`)
    throw err
  }
}

function validate(input: WebhookInput): void {
  if (input.name !== undefined && !input.name.trim()) throw new WebhookInputError('name is required')
  if (input.preset != null && !getPreset(input.preset)) throw new WebhookInputError(`unknown preset "${input.preset}"`)
  if (input.events !== undefined) {
    if (input.events.length === 0) throw new WebhookInputError('subscribe to at least one event')
    for (const e of input.events) {
      if (e !== '*' && !isWebhookEvent(e)) throw new WebhookInputError(`unknown event "${e}"`)
    }
  }
  if (input.method !== undefined && !(METHODS as readonly string[]).includes(input.method.toUpperCase())) {
    throw new WebhookInputError(`unsupported method "${input.method}"`)
  }
  if (input.url !== undefined) {
    if (!input.url.trim()) throw new WebhookInputError('url is required')
    checkTemplate('url', input.url)
  }
  if (input.headers !== undefined) {
    if (input.headers.length > MAX_HEADERS) throw new WebhookInputError(`at most ${MAX_HEADERS} headers`)
    for (const h of input.headers) {
      if (!HEADER_NAME.test(h.name)) throw new WebhookInputError(`invalid header name "${h.name}"`)
      checkTemplate(`header ${h.name}`, h.value)
    }
  }
  if (input.body != null) checkTemplate('body', input.body)
  if (input.secrets !== undefined) {
    for (const k of Object.keys(input.secrets)) {
      if (!SECRET_NAME.test(k)) throw new WebhookInputError(`invalid secret name "${k}" (use UPPER_SNAKE_CASE)`)
    }
  }
}

function mergeSecrets(current: Record<string, string>, patch: Record<string, string | null>): string | null {
  const next = { ...current }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]
    else next[k] = v
  }
  if (Object.keys(next).length > MAX_SECRETS) throw new WebhookInputError(`at most ${MAX_SECRETS} secrets`)
  return Object.keys(next).length ? encryptToken(JSON.stringify(next)) : null
}

export async function createWebhook(
  input: WebhookInput & { name: string; events: string[]; url: string },
): Promise<WebhookRow> {
  validate(input)
  const now = Date.now()
  const row = {
    id: ulid(),
    name: input.name.trim(),
    enabled: input.enabled === false ? 0 : 1,
    preset: input.preset ?? null,
    events: JSON.stringify(input.events),
    method: (input.method ?? 'POST').toUpperCase(),
    url: input.url.trim(),
    headers: JSON.stringify(input.headers ?? []),
    body: input.body ?? null,
    contentType: input.contentType ?? 'application/json',
    secrets: input.secrets ? mergeSecrets({}, input.secrets) : null,
    signingSecret: input.signingSecret ? encryptToken(input.signingSecret) : null,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(webhooks).values(row)
  return row
}

export async function updateWebhook(existing: WebhookRow, input: WebhookInput): Promise<WebhookRow> {
  validate(input)
  const patch: Partial<typeof webhooks.$inferInsert> = { updatedAt: Date.now() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0
  if (input.preset !== undefined) patch.preset = input.preset
  if (input.events !== undefined) patch.events = JSON.stringify(input.events)
  if (input.method !== undefined) patch.method = input.method.toUpperCase()
  if (input.url !== undefined) patch.url = input.url.trim()
  if (input.headers !== undefined) patch.headers = JSON.stringify(input.headers)
  if (input.body !== undefined) patch.body = input.body
  if (input.contentType !== undefined) patch.contentType = input.contentType
  if (input.secrets !== undefined) patch.secrets = mergeSecrets(decodeSecrets(existing), input.secrets)
  if (input.signingSecret !== undefined) {
    patch.signingSecret = input.signingSecret ? encryptToken(input.signingSecret) : null
  }
  await db.update(webhooks).set(patch).where(eq(webhooks.id, existing.id))
  return { ...existing, ...patch } as WebhookRow
}

export type DeliveryView = {
  id: string
  webhookId: string
  event: string
  status: string
  attempts: number
  nextAttemptAt: number | null
  lastStatusCode: number | null
  lastError: string | null
  request: unknown
  responseBody: string | null
  durationMs: number | null
  createdAt: number
  completedAt: number | null
}

export function deliveryView(row: typeof webhookDeliveries.$inferSelect): DeliveryView {
  let request: unknown = null
  try {
    request = row.request ? JSON.parse(row.request) : null
  } catch {}
  return {
    id: row.id,
    webhookId: row.webhookId,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.status === 'pending' ? (row.nextAttemptAt ?? null) : null,
    lastStatusCode: row.lastStatusCode ?? null,
    lastError: row.lastError ?? null,
    request,
    responseBody: row.responseBody ?? null,
    durationMs: row.durationMs ?? null,
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? null,
  }
}
