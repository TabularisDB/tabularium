// Thin wrapper around Bun.password (argon2id by default) so callers don't depend on the global.

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < 8) throw new Error('Password must be at least 8 characters')
  return Bun.password.hash(plaintext, { algorithm: 'argon2id' })
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plaintext, hash)
  } catch {
    return false
  }
}
