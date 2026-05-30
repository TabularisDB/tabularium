import { ulid } from 'ulid'
import { eq, desc } from 'drizzle-orm'
import { db } from '$db'
import { publisherTokens } from '$db/schema'

const TOKEN_PREFIX = 'tpub_'
const TOKEN_BYTES = 24

const TOKEN_NAME_MAX = 80
const SCOPE_MAX = 80
const MAX_SCOPES = 32

const SCOPE_ACTIONS = ['publish', 'yank', 'manage-owners'] as const
type ScopeAction = (typeof SCOPE_ACTIONS)[number]

export class PublisherTokenError extends Error {
  constructor(
    public code: 'invalid' | 'not_found' | 'forbidden',
    message: string,
  ) {
    super(message)
    this.name = 'PublisherTokenError'
  }
}

export type PublisherTokenRow = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: number | null
  lastUsedAt: number | null
  createdAt: number
  revokedAt: number | null
}

function rowToView(row: typeof publisherTokens.$inferSelect): PublisherTokenRow {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: JSON.parse(row.scopes) as string[],
    expiresAt: row.expiresAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt ?? null,
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
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
  if (typeof raw !== 'string') throw new PublisherTokenError('invalid', 'name must be a string')
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > TOKEN_NAME_MAX) {
    throw new PublisherTokenError('invalid', `name must be 1–${TOKEN_NAME_MAX} chars`)
  }
  return trimmed
}

// Scope format: <action>:<target>. action ∈ SCOPE_ACTIONS; target is either
// `*` (wildcard) or a plugin slug (`^[a-z][a-z0-9-]*$`).
function parseScope(raw: string): { action: ScopeAction; target: string } {
  const idx = raw.indexOf(':')
  if (idx <= 0 || idx === raw.length - 1) {
    throw new PublisherTokenError('invalid', `scope must be "<action>:<target>" — got "${raw}"`)
  }
  const action = raw.slice(0, idx) as ScopeAction
  const target = raw.slice(idx + 1)
  if (!SCOPE_ACTIONS.includes(action)) {
    throw new PublisherTokenError('invalid', `unknown scope action "${action}" — expected ${SCOPE_ACTIONS.join(' / ')}`)
  }
  if (target !== '*' && !/^[a-z][a-z0-9-]*$/.test(target)) {
    throw new PublisherTokenError('invalid', `scope target "${target}" must be "*" or a plugin slug`)
  }
  return { action, target }
}

export function validateScopes(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new PublisherTokenError('invalid', 'scopes must be a non-empty array of strings')
  }
  if (raw.length > MAX_SCOPES) {
    throw new PublisherTokenError('invalid', `max ${MAX_SCOPES} scopes per token`)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') throw new PublisherTokenError('invalid', 'each scope must be a string')
    const trimmed = entry.trim()
    if (!trimmed || trimmed.length > SCOPE_MAX) {
      throw new PublisherTokenError('invalid', `scope must be 1–${SCOPE_MAX} chars`)
    }
    parseScope(trimmed) // throws on invalid shape
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function validateExpiresAt(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new PublisherTokenError('invalid', 'expiresAt must be a unix-ms timestamp or null')
  }
  if (raw <= Date.now()) {
    throw new PublisherTokenError('invalid', 'expiresAt must be in the future')
  }
  return Math.floor(raw)
}

export async function createPublisherToken(input: {
  userId: string
  name: unknown
  scopes: unknown
  expiresAt?: unknown
}): Promise<{ id: string; token: string; row: PublisherTokenRow }> {
  const name = validateName(input.name)
  const scopes = validateScopes(input.scopes)
  const expiresAt = validateExpiresAt(input.expiresAt)
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const prefix = token.slice(0, TOKEN_PREFIX.length + 8)
  const id = ulid()
  await db.insert(publisherTokens).values({
    id,
    userId: input.userId,
    name,
    prefix,
    tokenHash,
    scopes: JSON.stringify(scopes),
    expiresAt: expiresAt ?? null,
  })
  const row = await db.query.publisherTokens.findFirst({ where: { id } })
  if (!row) throw new PublisherTokenError('invalid', 'failed to load created token')
  return { id, token, row: rowToView(row) }
}

export async function listPublisherTokens(userId: string): Promise<PublisherTokenRow[]> {
  const rows = await db
    .select()
    .from(publisherTokens)
    .where(eq(publisherTokens.userId, userId))
    .orderBy(desc(publisherTokens.createdAt))
  return rows.map(rowToView)
}

export async function revokePublisherToken(userId: string, tokenId: string): Promise<void> {
  const row = await db.query.publisherTokens.findFirst({ where: { id: tokenId } })
  if (!row) throw new PublisherTokenError('not_found', `token "${tokenId}" not found`)
  if (row.userId !== userId) throw new PublisherTokenError('forbidden', "cannot revoke another user's token")
  if (row.revokedAt) return
  await db.update(publisherTokens).set({ revokedAt: Date.now() }).where(eq(publisherTokens.id, tokenId))
}

export type VerifiedPublisherToken = {
  id: string
  userId: string
  scopes: string[]
}

export async function verifyPublisherToken(raw: string): Promise<VerifiedPublisherToken | null> {
  if (!raw.startsWith(TOKEN_PREFIX)) return null
  const tokenHash = await sha256Hex(raw)
  const row = await db.query.publisherTokens.findFirst({ where: { tokenHash } })
  if (!row) return null
  if (row.revokedAt) return null
  if (row.expiresAt && row.expiresAt <= Date.now()) return null
  void db.update(publisherTokens).set({ lastUsedAt: Date.now() }).where(eq(publisherTokens.id, row.id))
  return {
    id: row.id,
    userId: row.userId,
    scopes: JSON.parse(row.scopes) as string[],
  }
}

// hasScope("publish:firestore", ["publish:*"])              → true  (wildcard)
// hasScope("publish:firestore", ["publish:firestore"])      → true  (exact)
// hasScope("publish:firestore", ["publish:postgres"])       → false (different slug)
// hasScope("yank:firestore",    ["publish:*"])              → false (action mismatch)
export function hasScope(required: string, tokenScopes: string[]): boolean {
  const want = parseScope(required)
  for (const granted of tokenScopes) {
    let parsed: { action: ScopeAction; target: string }
    try {
      parsed = parseScope(granted)
    } catch {
      continue
    }
    if (parsed.action !== want.action) continue
    if (parsed.target === '*' || parsed.target === want.target) return true
  }
  return false
}

export function isPublisherToken(raw: string): boolean {
  return raw.startsWith(TOKEN_PREFIX)
}

export { TOKEN_PREFIX as PUBLISHER_TOKEN_PREFIX }
