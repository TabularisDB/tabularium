import { getSetting } from './settings'

export type Features = {
  submissionsEnabled: boolean
  requestsEnabled: boolean
  // Whether plugin manifests may declare a `requires[]` field. When false,
  // a non-empty `requires[]` is silently dropped at ingest time (see
  // `manifest-apply.ts`) so authors who publish to multiple registries
  // aren't blocked by an instance-level opt-out.
  requiresAllowed: boolean
}

function flag(key: string, fallback: boolean): boolean {
  const v = getSetting(key)
  if (v === undefined) return fallback
  return v === 'true' || v === '1'
}

export function getFeatures(): Features {
  return {
    submissionsEnabled: flag('features.submissions_enabled', true),
    requestsEnabled: flag('features.requests_enabled', true),
    requiresAllowed: flag('plugins.requires_allowed', true),
  }
}
