import { ulid } from 'ulid'
import { eq, desc } from 'drizzle-orm'
import { db } from '$db'
import { adminTokens } from '$db/schema'

// Token format: `tbm_<22 url-safe base64 chars>` (132 bits of entropy).
// The `tbm_` prefix is so middleware can short-circuit JWT verification
// when it sees an obvious API-token request.
const TOKEN_PREFIX = 'tbm_'
const TOKEN_BYTES = 24

const TOKEN_NAME_MAX = 80
const SCOPE_MAX = 40
const MAX_SCOPES = 16

export class AdminTokenError extends Error {
  constructor(
    public code: 'invalid' | 'not_found' | 'forbidden',
    message: string,
  ) {
    super(message)
    this.name = 'AdminTokenError'
  }
}

export type AdminTokenRow = {
  id: string
  name: string
  prefix: string
  scopes: string[] | null
  expiresAt: number | null
  lastUsedAt: number | null
  createdAt: number
  revokedAt: number | null
}

function rowToView(row: typeof adminTokens.$inferSelect): AdminTokenRow {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes ? (JSON.parse(row.scopes) as string[]) : null,
    expiresAt: row.expiresAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt ?? null,
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  // url-safe base64 without padding, ~32 chars
  const b64 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${TOKEN_PREFIX}${b64}`
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function validateName(raw: unknown): string {
  if (typeof raw !== 'string') throw new AdminTokenError('invalid', 'name must be a string')
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > TOKEN_NAME_MAX) {
    throw new AdminTokenError('invalid', `name must be 1–${TOKEN_NAME_MAX} chars`)
  }
  return trimmed
}

function validateScopes(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null
  if (!Array.isArray(raw)) throw new AdminTokenError('invalid', 'scopes must be an array of strings or null')
  if (raw.length === 0) return null
  if (raw.length > MAX_SCOPES) throw new AdminTokenError('invalid', `max ${MAX_SCOPES} scopes`)
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of raw) {
    if (typeof s !== 'string') throw new AdminTokenError('invalid', 'each scope must be a string')
    const trimmed = s.trim()
    if (!trimmed || trimmed.length > SCOPE_MAX) {
      throw new AdminTokenError('invalid', `scope must be 1–${SCOPE_MAX} chars`)
    }
    if (!/^[a-z][a-z0-9.:_-]*$/.test(trimmed)) {
      throw new AdminTokenError('invalid', `invalid scope "${trimmed}"`)
    }
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out.length > 0 ? out : null
}

function validateExpiresAt(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new AdminTokenError('invalid', 'expiresAt must be a unix-ms timestamp or null')
  }
  if (raw <= Date.now()) {
    throw new AdminTokenError('invalid', 'expiresAt must be in the future')
  }
  return Math.floor(raw)
}

export async function createAdminToken(input: {
  userId: string
  name: unknown
  scopes?: unknown
  expiresAt?: unknown
}): Promise<{ id: string; token: string; row: AdminTokenRow }> {
  const name = validateName(input.name)
  const scopes = validateScopes(input.scopes)
  const expiresAt = validateExpiresAt(input.expiresAt)
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const prefix = token.slice(0, TOKEN_PREFIX.length + 8) // `tbm_xxxxxxxx`
  const id = ulid()
  await db.insert(adminTokens).values({
    id,
    userId: input.userId,
    name,
    prefix,
    tokenHash,
    scopes: scopes ? JSON.stringify(scopes) : null,
    expiresAt: expiresAt ?? null,
  })
  const row = await db.query.adminTokens.findFirst({ where: { id } })
  if (!row) throw new AdminTokenError('invalid', 'failed to load created token')
  return { id, token, row: rowToView(row) }
}

export async function listAdminTokens(userId: string): Promise<AdminTokenRow[]> {
  const rows = await db
    .select()
    .from(adminTokens)
    .where(eq(adminTokens.userId, userId))
    .orderBy(desc(adminTokens.createdAt))
  return rows.map(rowToView)
}

export async function revokeAdminToken(userId: string, tokenId: string): Promise<void> {
  const row = await db.query.adminTokens.findFirst({ where: { id: tokenId } })
  if (!row) throw new AdminTokenError('not_found', `token "${tokenId}" not found`)
  if (row.userId !== userId) throw new AdminTokenError('forbidden', 'cannot revoke another user’s token')
  if (row.revokedAt) return
  await db.update(adminTokens).set({ revokedAt: Date.now() }).where(eq(adminTokens.id, tokenId))
}

export type VerifiedToken = { id: string; userId: string; scopes: string[] | null }

export async function verifyAdminToken(raw: string): Promise<VerifiedToken | null> {
  if (!raw.startsWith(TOKEN_PREFIX)) return null
  const tokenHash = await sha256Hex(raw)
  const row = await db.query.adminTokens.findFirst({ where: { tokenHash } })
  if (!row) return null
  if (row.revokedAt) return null
  if (row.expiresAt && row.expiresAt <= Date.now()) return null
  // Fire-and-forget — `last_used_at` is for UX, not correctness.
  void db.update(adminTokens).set({ lastUsedAt: Date.now() }).where(eq(adminTokens.id, row.id))
  return {
    id: row.id,
    userId: row.userId,
    scopes: row.scopes ? (JSON.parse(row.scopes) as string[]) : null,
  }
}

export function isApiToken(raw: string): boolean {
  return raw.startsWith(TOKEN_PREFIX)
}

export { TOKEN_PREFIX }
