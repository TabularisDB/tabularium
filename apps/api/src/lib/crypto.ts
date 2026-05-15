import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from './env'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const FORMAT_V1 = 0x01

function getKey(): Buffer {
  return Buffer.from(env.TOKEN_ENC_KEY, 'hex')
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.of(FORMAT_V1), iv, tag, enc]).toString('base64')
}

function decryptLayout(buf: Buffer, offset: number): string {
  const iv = buf.subarray(offset, offset + IV_LEN)
  const tag = buf.subarray(offset + IV_LEN, offset + IV_LEN + TAG_LEN)
  const enc = buf.subarray(offset + IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export function decryptToken(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64')
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short')
  if (buf.length >= 1 + IV_LEN + TAG_LEN && buf[0] === FORMAT_V1) {
    try {
      return decryptLayout(buf, 1)
    } catch {
      // fall through to legacy layout; legacy IV could start with 0x01 too
    }
  }
  return decryptLayout(buf, 0)
}
