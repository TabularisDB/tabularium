import semver from 'semver'

// Returns negative if a < b, positive if a > b, 0 if equal or unparseable.
// Coerces lax tag formats ("v1.2", "1.2") so legacy release tags still order.
export function compareSemver(a: string, b: string): number {
  const sa = semver.coerce(a)
  const sb = semver.coerce(b)
  if (!sa || !sb) return 0
  return semver.compare(sa, sb)
}
