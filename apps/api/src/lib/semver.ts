import semver from 'semver'
import { SEMVER_VERSION_PATTERN } from '@tabularium/manifest'

// Same shape as the manifest schema's `version` regex. `semver.valid()`
// accepts a leading "v" and normalises it away, which is too lax for tag
// ingestion — we want X.Y.Z exactly.
const STRICT_SEMVER_RE = new RegExp(SEMVER_VERSION_PATTERN)

// Returns negative if a < b, positive if a > b, 0 if equal or unparseable.
// Coerces lax tag formats ("v1.2", "1.2") so legacy release tags still order.
export function compareSemver(a: string, b: string): number {
  const sa = semver.coerce(a)
  const sb = semver.coerce(b)
  if (!sa || !sb) return 0
  return semver.compare(sa, sb)
}

export class InvalidVersionError extends Error {
  readonly version: string
  constructor(version: string) {
    super(
      `version "${version}" is not strict semver — must be X.Y.Z with optional "-prerelease" and "+build" (no leading "v")`,
    )
    this.name = 'InvalidVersionError'
    this.version = version
  }
}

// Strict X.Y.Z (no "v" prefix). Matches the regex used by the manifest schema
// so a manifest version can never be valid but its tag-derived counterpart
// invalid. Use this at every ingest boundary BEFORE writing a release row.
export function isStrictSemver(version: string): boolean {
  if (typeof version !== 'string') return false
  if (!STRICT_SEMVER_RE.test(version)) return false
  return semver.valid(version) !== null
}

export function assertStrictSemver(version: string): void {
  if (!isStrictSemver(version)) throw new InvalidVersionError(version)
}

// Normalises a release tag to a strict-semver version string, or throws.
// Strips a single leading "v" (the GitHub/Codeberg convention).
export function tagToVersion(tag: string): string {
  const stripped = tag.replace(/^v/, '')
  assertStrictSemver(stripped)
  return stripped
}
