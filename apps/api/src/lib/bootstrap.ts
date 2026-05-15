import { hashPassword, verifyPassword } from './password'
import { isProd } from './env'

export const BOOTSTRAP_EMAIL = 'admin@example.com'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const BOOTSTRAP_PW_FILE = './data/bootstrap-password'

type BootstrapState = {
  email: string
  passwordHash: string
}

let state: BootstrapState | null = null

export async function initBootstrap(): Promise<void> {
  if (isProd() && !process.env.BOOTSTRAP_PASSWORD) {
    throw new Error(
      'BOOTSTRAP_PASSWORD must be set in production. Generate with `openssl rand -hex 24` and set it via env/secret.',
    )
  }
  const fromEnv = process.env.BOOTSTRAP_PASSWORD
  const plaintext = fromEnv ?? generatePassword()
  const passwordHash = await hashPassword(plaintext)
  state = { email: BOOTSTRAP_EMAIL, passwordHash }
  if (!fromEnv) {
    await Bun.write(BOOTSTRAP_PW_FILE, plaintext)
    printFileBanner(BOOTSTRAP_PW_FILE)
  } else {
    printEnvBanner()
  }
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

function printFileBanner(path: string): void {
  const url = `${process.env.BASE_URL ?? 'http://localhost:3000'}/init`
  const bar = '━'.repeat(64)
  console.log('')
  console.log(bar)
  console.log('  FIRST-RUN SETUP')
  console.log('')
  console.log('  Open the registry in your browser:')
  console.log(`    ${url}`)
  console.log('')
  console.log(`    Email:    ${BOOTSTRAP_EMAIL}`)
  console.log(`    Password: (written to ${path})`)
  console.log('')
  console.log('  Set BOOTSTRAP_PASSWORD env var to pin it across reboots.')
  console.log(bar)
  console.log('')
}

function printEnvBanner(): void {
  const url = `${process.env.BASE_URL ?? 'http://localhost:3000'}/init`
  const bar = '━'.repeat(64)
  console.log('')
  console.log(bar)
  console.log('  FIRST-RUN SETUP')
  console.log('')
  console.log('  Open the registry in your browser:')
  console.log(`    ${url}`)
  console.log('')
  console.log(`    Email:    ${BOOTSTRAP_EMAIL}`)
  console.log('    Password: (from BOOTSTRAP_PASSWORD env var)')
  console.log(bar)
  console.log('')
}
