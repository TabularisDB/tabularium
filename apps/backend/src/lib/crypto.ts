import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from './env'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  return Buffer.from(env.TOKEN_ENC_KEY, 'hex')
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptToken(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64')
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
