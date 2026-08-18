import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// A strict-semver version is a prerelease exactly when it carries a "-suffix"
// ahead of any "+build" metadata (1.0.0-beta.7). Ingest rejects anything that
// is not strict semver, so a hyphen cannot show up anywhere else.
export function isPrerelease(version: string | null | undefined): boolean {
  if (!version) return false
  return version.split('+')[0].includes('-')
}
