import { resolve } from 'node:path'
import { hashPassword, verifyPassword } from './password'
import { env } from './env'

export const BOOTSTRAP_EMAIL = 'admin@example.com'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const BOOTSTRAP_PW_FILE = resolve(env.DATA_DIR, 'bootstrap-password')

type BootstrapState = {
  email: string
  passwordHash: string
}

let state: BootstrapState | null = null

export async function initBootstrap(): Promise<void> {
  const fromEnv = process.env.BOOTSTRAP_PASSWORD
  const plaintext = fromEnv ?? generatePassword()
  const passwordHash = await hashPassword(plaintext)
  state = { email: BOOTSTRAP_EMAIL, passwordHash }
  if (!fromEnv) await Bun.write(BOOTSTRAP_PW_FILE, plaintext)
  printBanner(fromEnv ? 'env' : 'file')
}

export function isBootstrapActive(): boolean {
  return state !== null
}

export function getBootstrap(): { email: string; passwordHash: string } | null {
  return state ? { email: state.email, passwordHash: state.passwordHash } : null
}

export async function verifyBootstrap(email: string, password: string): Promise<boolean> {
  if (!state) return false
  if (email.toLowerCase() !== state.email.toLowerCase()) return false
  return verifyPassword(password, state.passwordHash)
}

export function clearBootstrap(): void {
  state = null
}

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

function printBanner(source: 'env' | 'file'): void {
  const url = `${process.env.BASE_URL ?? 'http://localhost:3000'}/init`
  const bar = '━'.repeat(64)
  const passwordLine =
    source === 'env'
      ? '    Password: (from BOOTSTRAP_PASSWORD env var)'
      : `    Password: (written to ${BOOTSTRAP_PW_FILE})`
  const tail = source === 'env' ? '' : '\n  Set BOOTSTRAP_PASSWORD env var to pin it across reboots.'
  console.log(
    `\n${bar}\n  FIRST-RUN SETUP\n\n  Open the registry in your browser:\n    ${url}\n\n    Email:    ${BOOTSTRAP_EMAIL}\n${passwordLine}\n${tail}\n${bar}\n`,
  )
}
