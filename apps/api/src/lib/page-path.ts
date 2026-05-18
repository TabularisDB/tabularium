const RESERVED_PATHS = new Set([
  '/',
  '/admin',
  '/api',
  '/auth',
  '/openapi',
  '/uploads',
  '/login',
  '/welcome',
  '/init',
  '/settings',
  '/plugins',
  '/requests',
  '/submit',
  '/healthz',
  '/robots.txt',
])

const PATH_RE = /^\/[a-z0-9][a-z0-9/_-]*$|^\/$/i

export function normalizePath(input: string): string {
  let p = input.trim()
  if (!p.startsWith('/')) p = `/${p}`
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export function validatePath(input: string): { ok: true; path: string } | { ok: false; error: string } {
  const p = normalizePath(input)
  if (p.length > 200) return { ok: false, error: 'path too long (max 200 chars)' }
  if (!PATH_RE.test(p))
    return {
      ok: false,
      error: 'path must be `/`, or start with `/` and use letters, digits, hyphens, underscores, slashes',
    }
  for (const reserved of RESERVED_PATHS) {
    if (reserved === '/') continue
    if (p === reserved || p.startsWith(`${reserved}/`)) {
      return { ok: false, error: `path conflicts with reserved route ${reserved}` }
    }
  }
  if (p === '/') {
    return { ok: false, error: 'path `/` is reserved' }
  }
  return { ok: true, path: p }
}

export const SEEDED_PAGE_PATHS = new Set(['/about', '/privacy', '/terms'])

export function isSeededPath(path: string): boolean {
  return SEEDED_PAGE_PATHS.has(normalizePath(path))
}
