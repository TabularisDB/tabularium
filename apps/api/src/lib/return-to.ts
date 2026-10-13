import { env, allowedOrigins } from '$lib/env'

/**
 * Validate a post-sign-in destination: a path on the web app, or a full URL on
 * a site trusted for CORS (e.g. a project website hosting the request form).
 * Paths come back relative, trusted URLs absolute; anything else is null.
 */
export function safeReturnTo(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string' || raw.length > 512) return null
  try {
    const base = env.WEB_BASE_URL ?? env.BASE_URL
    const baseOrigin = new URL(base).origin
    const target = new URL(raw, base)
    if (target.origin === baseOrigin) return target.pathname + target.search + target.hash
    // Sites trusted for CORS (e.g. a project website hosting the request form)
    // may also get the user back after sign-in; they keep their full URL.
    if ((target.protocol === 'https:' || target.protocol === 'http:') && allowedOrigins().includes(target.origin))
      return target.href
    return null
  } catch {
    return null
  }
}
