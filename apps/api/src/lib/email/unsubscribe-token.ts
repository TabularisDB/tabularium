import { SignJWT, jwtVerify } from 'jose'
import { ulid } from 'ulid'
import { db } from '$db'
import { emailPreferences } from '$db/schema'
import { getSetting, setSetting } from '$lib/settings'

const SECRET_KEY = 'email.unsubscribe_secret'
const ALG = 'HS256'
const EXPIRY = '1y'

let secretBytesCache: Uint8Array | null = null

async function getOrCreateSecret(): Promise<Uint8Array> {
  if (secretBytesCache) return secretBytesCache
  let raw = getSetting(SECRET_KEY)
  if (!raw) {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    raw = Buffer.from(bytes).toString('base64url')
    await setSetting(SECRET_KEY, raw, { encrypted: true })
  }
  secretBytesCache = new Uint8Array(Buffer.from(raw, 'base64url'))
  return secretBytesCache
}

// Exported for tests so they can simulate a key-rotation scenario.
export function __resetSecretCacheForTests(): void {
  secretBytesCache = null
}

export type DefaultPrefs = Record<string, string>

export async function initPreferences(
  userId: string,
  defaults: DefaultPrefs = {},
): Promise<{ tokenNonce: string; prefs: DefaultPrefs }> {
  const existing = await db.query.emailPreferences.findFirst({ where: { userId } })
  if (existing)
    return { tokenNonce: existing.tokenNonce, prefs: JSON.parse(existing.prefs) as DefaultPrefs }
  const tokenNonce = ulid()
  const prefs = defaults
  await db.insert(emailPreferences).values({ userId, prefs: JSON.stringify(prefs), tokenNonce })
  return { tokenNonce, prefs }
}

/**
 * Rotate the per-user token nonce so previously-issued unsubscribe tokens
 * stop verifying. Called from PATCH /api/users/me/email-profile on email
 * change (Task 4) and from the explicit "regenerate links" admin action.
 */
export async function rotateTokenNonce(userId: string): Promise<string> {
  const tokenNonce = ulid()
  const updatedAt = Date.now()
  await db
    .insert(emailPreferences)
    .values({ userId, prefs: '{}', tokenNonce, updatedAt })
    .onConflictDoUpdate({
      target: emailPreferences.userId,
      set: { tokenNonce, updatedAt },
    })
  return tokenNonce
}

export async function mintUnsubscribeToken(userId: string): Promise<string> {
  const { tokenNonce } = await initPreferences(userId)
  const secret = await getOrCreateSecret()
  return new SignJWT({ scope: 'prefs', nonce: tokenNonce })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret)
}

export async function verifyUnsubscribeToken(token: string): Promise<{ userId: string } | null> {
  try {
    const secret = await getOrCreateSecret()
    const { payload } = await jwtVerify(token, secret)
    if (payload.scope !== 'prefs' || typeof payload.sub !== 'string') return null
    const prefs = await db.query.emailPreferences.findFirst({ where: { userId: payload.sub } })
    if (!prefs || prefs.tokenNonce !== payload.nonce) return null
    return { userId: payload.sub }
  } catch {
    return null
  }
}
