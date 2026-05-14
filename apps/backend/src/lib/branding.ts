import { getSetting } from './settings'

export type Branding = {
  name: string
  tagline: string
  primaryHex: string
  accentHex: string
  successHex: string
  logoUrl: string | null
  faviconUrl: string | null
  footerText: string | null
  analyticsScript: string | null
  allowIndexing: boolean
}

const DEFAULTS: Branding = {
  name: 'Tabularium',
  tagline: 'Discover, submit, ship plugins.',
  primaryHex: '#3b82f6',
  accentHex: '#8b5cf6',
  successHex: '#10b981',
  logoUrl: null,
  faviconUrl: null,
  footerText: null,
  analyticsScript: null,
  allowIndexing: true,
}

function readBool(key: string, fallback: boolean): boolean {
  const v = getSetting(key)
  if (v === undefined) return fallback
  return v === '1' || v === 'true'
}

export function getBranding(): Branding {
  return {
    name: getSetting('branding.name') ?? DEFAULTS.name,
    tagline: getSetting('branding.tagline') ?? DEFAULTS.tagline,
    primaryHex: getSetting('branding.primary_hex') ?? DEFAULTS.primaryHex,
    accentHex: getSetting('branding.accent_hex') ?? DEFAULTS.accentHex,
    successHex: getSetting('branding.success_hex') ?? DEFAULTS.successHex,
    logoUrl: getSetting('branding.logo_url') ?? DEFAULTS.logoUrl,
    faviconUrl: getSetting('branding.favicon_url') ?? DEFAULTS.faviconUrl,
    footerText: getSetting('branding.footer_text') ?? DEFAULTS.footerText,
    analyticsScript: getSetting('branding.analytics_script') ?? DEFAULTS.analyticsScript,
    allowIndexing: readBool('branding.allow_indexing', DEFAULTS.allowIndexing),
  }
}

export function defaultBranding(): Branding {
  return { ...DEFAULTS }
}
