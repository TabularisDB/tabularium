import { randomBytes } from 'node:crypto'
import { getBranding, defaultBranding, type Branding } from '$lib/branding'
import { env } from '$lib/env'
import { listEnabledInstances, type ProviderInstance } from '$lib/provider-instance'
import { icon } from './icons'
import { pageStyles } from './page-styles'

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function imageUrl(raw: string | null): string | null {
  if (!raw || !/^(https?:\/\/|\/[^/\\])/.test(raw) || /[\x00-\x1f]/.test(raw)) return null
  try {
    const url = new URL(raw, env.BASE_URL)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    return raw.startsWith('/') ? url.pathname + url.search : url.href
  } catch {
    return null
  }
}
function color(raw: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback
}
function onPrimary(hex: string) {
  const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  return (luminance + 0.05) / 0.0527 > 1.05 / (luminance + 0.05) ? '#08090a' : '#ffffff'
}
function brandMark(brand: Branding) {
  const logo = imageUrl(brand.logoUrl)
  return `<span class="brand-mark${logo ? ' custom' : ''}">${logo ? `<img src="${escapeHtml(logo)}" alt="" referrerpolicy="no-referrer">` : icon('boxes')}</span>`
}
function providerImage(provider: ProviderInstance) {
  const custom = imageUrl(provider.logoUrl)
  const slug =
    provider.kind === 'github'
      ? 'github'
      : provider.kind === 'gitlab'
        ? 'gitlab'
        : new URL(provider.baseUrl).hostname === 'codeberg.org'
          ? 'codeberg'
          : 'forgejo'
  return { src: custom ?? `https://cdn.simpleicons.org/${slug}`, github: !custom && slug === 'github' }
}

type PageOptions = { kind?: 'login' | 'consent' | 'connections' | 'error'; callbackOrigin?: string }
export function page(title: string, body: string, options: PageOptions = {}) {
  const nonce = randomBytes(18).toString('base64')
  const brand = getBranding()
  const defaults = defaultBranding()
  const primary = color(brand.primaryHex, defaults.primaryHex)
  const accent = color(brand.accentHex, defaults.accentHex)
  const success = color(brand.successHex, defaults.successHex)
  const favicon = imageUrl(brand.faviconUrl) ?? '/favicon.svg'
  const sources = [imageUrl(brand.logoUrl), favicon, ...listEnabledInstances().map((p) => providerImage(p).src)]
  const imageOrigins = [
    ...new Set(sources.filter((s): s is string => !!s).map((s) => new URL(s, env.BASE_URL).origin)),
  ].join(' ')
  const home = escapeHtml(env.WEB_BASE_URL ?? env.BASE_URL)
  const kind = options.kind ?? 'login'
  const symbol =
    kind === 'error'
      ? icon('circle-alert')
      : kind === 'connections'
        ? icon('plug')
        : `${brandMark(brand)}<span class="connection-line">${icon('link')}</span><span class="app-mark">${icon('plug')}</span>`
  // Match the main application's mode-watcher preference without loading its
  // SPA or any administrator-supplied analytics on an authorization screen.
  const themeScript = `(()=>{const root=document.documentElement;let mode;try{mode=localStorage.getItem('mode-watcher-mode')}catch{}root.dataset.theme=mode==='light'||mode==='dark'?mode:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.addEventListener('DOMContentLoaded',()=>{const button=document.getElementById('theme-toggle');button.hidden=false;button.addEventListener('click',()=>{const next=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=next;try{localStorage.setItem('mode-watcher-mode',next)}catch{}})})})()`
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · ${escapeHtml(brand.name)}</title><link rel="icon" href="${escapeHtml(favicon)}"><script nonce="${nonce}">${themeScript}</script><style nonce="${nonce}">${pageStyles}:root{--brand-primary:${primary};--brand-accent:${accent};--brand-success:${success};--brand-on-primary:${onPrimary(primary)}}
    </style></head><body><header class="site-header"><div class="header-inner"><a class="brand" href="${home}" aria-label="${escapeHtml(brand.name)} home">${brandMark(brand)}<span class="brand-name">${escapeHtml(brand.name)}</span></a><div class="header-actions"><a class="back-link" aria-label="Back to registry" href="${home}">${icon('arrow-left')}<span class="back-label">Back to registry</span></a><button class="icon-button" id="theme-toggle" type="button" aria-label="Switch color theme" title="Switch color theme" hidden>${icon('sun', 'sun-icon')}${icon('moon', 'moon-icon')}</button></div></div></header><main class="${kind}"><div class="page-heading"><div class="connection-symbol" aria-hidden="true">${symbol}</div><h1>${escapeHtml(title)}</h1></div>${body}</main><footer class="site-footer"><p>${escapeHtml(brand.footerText ?? brand.name)}</p></footer></body></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'same-origin',
        'x-frame-options': 'DENY',
        'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'self' ${imageOrigins}; form-action 'self' ${options.callbackOrigin ?? ''}; frame-ancestors 'none'; base-uri 'none'`,
      },
    },
  )
}

export function loginPage(returnTo: string, clientName?: string) {
  const brand = getBranding()
  const links = listEnabledInstances()
    .map((p) => {
      const logo = providerImage(p)
      return `<a class="provider" title="Continue with ${escapeHtml(p.displayName)}" href="/auth/${encodeURIComponent(p.id)}?return_to=${encodeURIComponent(returnTo)}"><img class="provider-image${logo.github ? ' github-default' : ''}" src="${escapeHtml(logo.src)}" alt="" referrerpolicy="no-referrer"><span class="provider-label">Continue with ${escapeHtml(p.displayName)}</span>${icon('arrow-right')}</a>`
    })
    .join('')
  return page(
    'Sign in to connect',
    `<p class="lead">Sign in to <strong>${escapeHtml(brand.name)}</strong>${clientName ? ` to connect <strong>${escapeHtml(clientName)}</strong>.` : ' to manage your connected applications.'}</p><section class="card">${links ? `<div class="provider-list">${links}</div>` : `<div class="empty-state">${icon('plug')}<strong>No sign-in providers are currently enabled.</strong><p>Ask your administrator to enable a sign-in provider in the ${escapeHtml(brand.name)} settings, then try again.</p></div>`}<p class="trust-note">${icon('shield-check')}<span>You choose what this application can access.<br>You can revoke access at any time.</span></p></section>`,
    { kind: 'login' },
  )
}

export function scopeLabel(scope: string): string {
  const common: Record<string, string> = {
    'catalog:read': 'Browse plugins, releases, documentation and community requests',
    'account:read': 'Read your profile, linked repositories and pending transfers',
    'plugins:write': 'Submit, publish, update, transfer and delete your plugins and releases',
    'requests:write': 'Create community requests, vote and claim requests',
  }
  if (common[scope]) return common[scope]
  const [, area, action] = scope.split(':')
  return `${action === 'read' ? 'Read' : 'Manage'} ${area.replaceAll('-', ' ')} as an administrator`
}
export function permissionList(scopes: string[]) {
  const titles: Record<string, string> = {
    'catalog:read': 'Browse the catalog',
    'account:read': 'View your account',
    'plugins:write': 'Manage your plugins',
    'requests:write': 'Participate in community requests',
  }
  return `<ul class="permissions">${scopes
    .map((scope) => {
      const symbol = scope.startsWith('admin:')
        ? 'shield-check'
        : scope.startsWith('plugins:')
          ? 'boxes'
          : scope.startsWith('account:')
            ? 'user-round'
            : scope.startsWith('requests:')
              ? 'message-square'
              : 'eye'
      return `<li><span class="permission-icon">${icon(symbol)}</span><div class="permission-text"><strong>${escapeHtml(titles[scope] ?? scopeLabel(scope))}</strong><span>${escapeHtml(titles[scope] ? scopeLabel(scope) : 'Limited to your current administrator permissions.')}</span></div></li>`
    })
    .join('')}</ul>`
}
