import { randomBytes } from 'node:crypto'

export function generateNonce(): string {
  return randomBytes(16).toString('base64')
}

// Build the CSP header. `strict-dynamic` propagates trust from nonce'd entry
// scripts to whatever they dynamically import (vite bundle chunks, analytics
// loaders, etc.) without us having to enumerate every URL.
export function cspHeader(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ')
}

// Stamp the nonce on every <script> tag in the served index.html so the
// SPA bundle survives the script-src whitelist. Also exposes the nonce to
// the runtime via a meta tag so branding's analytics injector can reuse it.
export function injectNonce(html: string, nonce: string): string {
  let out = html.replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
  if (!/<meta\s+name="csp-nonce"/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n    <meta name="csp-nonce" content="${nonce}">`)
  }
  return out
}
