import { createHash } from 'node:crypto'
import { CompactSign, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose'
import { canonicalize } from '@tabularium/manifest'
import { getSetting, setSetting } from './settings'

const ALG = 'EdDSA'
const CRV = 'Ed25519'

const KEYS = {
  publicJwk: 'registry.signing_key.public',
  privateJwk: 'registry.signing_key.private',
  kid: 'registry.signing_key.kid',
  createdAt: 'registry.signing_key.created_at',
  prevPublicJwk: 'registry.signing_key.previous.public',
  prevPrivateJwk: 'registry.signing_key.previous.private',
  prevKid: 'registry.signing_key.previous.kid',
  prevRotatedAt: 'registry.signing_key.previous.rotated_at',
} as const

export type PublicSigningJwk = JWK & {
  kid: string
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
  use: 'sig'
  alg: 'EdDSA'
  created_at?: number
  rotated_at?: number
}

/**
 * Derive a 16-character hex `kid` from the public key's `x` parameter
 * (the raw Ed25519 public key bytes, base64url-decoded).
 * Spec: "first 16 hex chars of sha256(public_key)".
 */
function deriveKid(publicJwk: JWK): string {
  const x = publicJwk.x
  if (!x || typeof x !== 'string') {
    throw new Error('public JWK missing `x` parameter')
  }
  const raw = Buffer.from(x, 'base64url')
  return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

async function generateNewKey(): Promise<{
  publicJwk: JWK
  privateJwk: JWK
  kid: string
}> {
  const { publicKey, privateKey } = await generateKeyPair(ALG, {
    crv: CRV,
    extractable: true,
  })
  const publicJwk = await exportJWK(publicKey)
  const privateJwk = await exportJWK(privateKey)
  const kid = deriveKid(publicJwk)
  return { publicJwk, privateJwk, kid }
}

async function writeCurrentKey(publicJwk: JWK, privateJwk: JWK, kid: string, createdAt: number): Promise<void> {
  await setSetting(KEYS.publicJwk, JSON.stringify(publicJwk))
  await setSetting(KEYS.privateJwk, JSON.stringify(privateJwk), { encrypted: true })
  await setSetting(KEYS.kid, kid)
  await setSetting(KEYS.createdAt, String(createdAt))
}

export async function ensureSigningKey(): Promise<void> {
  if (getSetting(KEYS.publicJwk)) return
  const { publicJwk, privateJwk, kid } = await generateNewKey()
  await writeCurrentKey(publicJwk, privateJwk, kid, Date.now())
}

function readJwk(key: string): JWK | null {
  const raw = getSetting(key)
  if (!raw) return null
  return JSON.parse(raw) as JWK
}

export async function getCurrentPublicJwk(): Promise<PublicSigningJwk> {
  const jwk = readJwk(KEYS.publicJwk)
  const kid = getSetting(KEYS.kid)
  if (!jwk || !kid) {
    throw new Error('signing key not initialized — call ensureSigningKey() first')
  }
  const createdAtRaw = getSetting(KEYS.createdAt)
  const created_at = createdAtRaw ? Number(createdAtRaw) : undefined
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: jwk.x as string,
    use: 'sig',
    alg: 'EdDSA',
    kid,
    ...(created_at !== undefined ? { created_at } : {}),
  }
}

export async function getPreviousPublicJwk(): Promise<PublicSigningJwk | null> {
  const jwk = readJwk(KEYS.prevPublicJwk)
  const kid = getSetting(KEYS.prevKid)
  if (!jwk || !kid) return null
  const rotatedRaw = getSetting(KEYS.prevRotatedAt)
  const rotated_at = rotatedRaw ? Number(rotatedRaw) : undefined
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: jwk.x as string,
    use: 'sig',
    alg: 'EdDSA',
    kid,
    ...(rotated_at !== undefined ? { rotated_at } : {}),
  }
}

export async function rotateSigningKey(): Promise<{ oldKid: string; newKid: string }> {
  // Ensure there's something to rotate from.
  await ensureSigningKey()
  const oldPublic = getSetting(KEYS.publicJwk)
  const oldPrivate = getSetting(KEYS.privateJwk)
  const oldKid = getSetting(KEYS.kid)
  if (!oldPublic || !oldPrivate || !oldKid) {
    throw new Error('cannot rotate: current signing key is incomplete')
  }

  // Copy current → previous (overwriting any earlier previous).
  await setSetting(KEYS.prevPublicJwk, oldPublic)
  await setSetting(KEYS.prevPrivateJwk, oldPrivate, { encrypted: true })
  await setSetting(KEYS.prevKid, oldKid)
  await setSetting(KEYS.prevRotatedAt, String(Date.now()))

  // Generate and persist new current.
  const { publicJwk, privateJwk, kid: newKid } = await generateNewKey()
  await writeCurrentKey(publicJwk, privateJwk, newKid, Date.now())

  return { oldKid, newKid }
}

export async function signPayload(payload: unknown): Promise<string> {
  const privateRaw = getSetting(KEYS.privateJwk)
  const kid = getSetting(KEYS.kid)
  if (!privateRaw || !kid) {
    throw new Error('signing key not initialized — call ensureSigningKey() first')
  }
  const privateJwk = JSON.parse(privateRaw) as JWK
  const key = await importJWK(privateJwk, ALG)
  const canonical = canonicalize(payload)
  const bytes = new TextEncoder().encode(canonical)
  return await new CompactSign(bytes).setProtectedHeader({ alg: ALG, kid }).sign(key)
}
