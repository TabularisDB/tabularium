import { getSetting } from './settings'

export type Features = {
  submissionsEnabled: boolean
  requestsEnabled: boolean
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
  }
}
