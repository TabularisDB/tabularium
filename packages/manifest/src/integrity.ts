/**
 * Asset & registry-signature integrity helpers.
 *
 * Pure Web Crypto — no Bun-specific APIs, no `node:*` imports. Runs in Bun,
 * Node ≥ 19, modern browsers and Deno.
 */

export interface VerifyAssetHashResult {
  ok: boolean
  sha256: string
  size: number
}

/**
 * Streams a body to the end, computing SHA-256 and total size, then compares
 * the digest against `expectedHex` in constant time.
 *
 * The current implementation buffers chunks before digesting — `crypto.subtle`
 * does not expose an incremental digest API. Callers that need bounded memory
 * should constrain the upstream stream (e.g. a size cap).
 */
export async function verifyAssetHash(
  stream: ReadableStream<Uint8Array>,
  expectedHex: string,
): Promise<VerifyAssetHashResult> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        size += value.byteLength
      }
    }
  } finally {
    reader.releaseLock()
  }

  const concatenated = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    concatenated.set(chunk, offset)
    offset += chunk.byteLength
  }

  const digest = await crypto.subtle.digest('SHA-256', concatenated)
  const sha256 = bytesToHex(new Uint8Array(digest))

  return {
    ok: constantTimeEqualHex(sha256, expectedHex),
    sha256,
    size,
  }
}

export interface VerifyRegistrySignatureInput {
  payloadBytes: Uint8Array
  signature: Uint8Array
  publicKeyJwk: JsonWebKey
}

/**
 * Verifies an Ed25519 signature over the canonical payload bytes using the
 * registry's public JWK. Throws if the JWK cannot be imported (e.g. wrong
 * curve / malformed); returns `false` for a well-formed but invalid signature.
 */
export async function verifyRegistrySignature(input: VerifyRegistrySignatureInput): Promise<boolean> {
  const { payloadBytes, signature, publicKeyJwk } = input
  const key = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify('Ed25519', key, signature as BufferSource, payloadBytes as BufferSource)
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Constant-time comparison for two hex strings of equal length. Returns false
 * fast if lengths differ — the length itself is not secret.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
