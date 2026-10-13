import { verifySessionToken, delegatedAccess } from '$lib/access'

/**
 * Viewer for public endpoints that personalise their response (e.g.
 * `claimedByMe`) without requiring auth: delegated access first, then a
 * Bearer token, then the session cookie. Invalid credentials mean anonymous.
 */
export async function resolveOptionalViewer(
  request: Request,
  headers: Record<string, string | undefined>,
  cookie: Record<string, { value?: unknown } | undefined>,
): Promise<{ sub: string } | null> {
  const delegated = delegatedAccess(request)
  if (delegated) return { sub: delegated.user.sub }
  const authHeader = headers.authorization
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const raw = cookie.auth?.value
  const cookieToken = typeof raw === 'string' ? raw : undefined
  const token = bearerToken ?? cookieToken
  if (!token) return null
  const payload = await verifySessionToken(token)
  return payload ? { sub: payload.sub } : null
}
