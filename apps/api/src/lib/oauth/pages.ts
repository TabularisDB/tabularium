import { randomBytes } from 'node:crypto'
import { listEnabledInstances } from '$lib/provider-instance'
export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export function page(title: string, body: string, callbackOrigin = '') {
  const nonce = randomBytes(18).toString('base64')
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Tabularium</title><style nonce="${nonce}">
  :root{color-scheme:light dark;--font-ui:system-ui,sans-serif;--paper:light-dark(#fff,#08090a);--ink:light-dark(#111827,#e5e7eb);--panel:light-dark(#f9fafb,#111214);--line:light-dark(#d1d5db,#374151);--muted:light-dark(#4b5563,#9ca3af);--accent:light-dark(#2563eb,#3b82f6);--on-accent:#fff;--link:light-dark(#1d4ed8,#93c5fd);--error:light-dark(#b91c1c,#fca5a5);--success:light-dark(#047857,#6ee7b7);font:16px/1.6 var(--font-ui);background:var(--paper);color:var(--ink)}
  *{box-sizing:border-box}html,body{overflow-x:clip}body{max-width:668px;margin:clamp(24px,8vh,80px) auto;padding:24px;overflow-wrap:anywhere}h1{line-height:1.2;font-size:30px;letter-spacing:-.025em}h1,h2{min-width:0;overflow-wrap:anywhere;font-style:normal}h2{font-size:20px}header{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}main{margin-top:32px}section{border:1px solid var(--line);border-radius:10px;padding:24px;margin:24px 0;background:var(--panel)}button,.button{display:inline-block;max-width:100%;border:1px solid var(--line);border-radius:6px;padding:10px 18px;min-height:44px;font:inherit;cursor:pointer;text-decoration:none;background:var(--panel);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}button:hover,.button:hover{border-color:var(--accent)}button:active,.button:active{transform:translateY(1px)}:is(button,a):focus-visible{outline:2px solid var(--accent);outline-offset:4px}button:disabled{cursor:wait;opacity:.65}button[value=allow]{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}code{overflow-wrap:anywhere;font-size:13px}a{color:var(--link)}.muted{color:var(--muted);font-size:14px}.error{color:var(--error)}.success{color:var(--success)}ul{padding-left:22px}li{margin:8px 0}.actions{display:flex;gap:12px;flex-wrap:wrap}@media(max-width:414px){body{padding:20px;margin-top:24px}section{padding:18px}h1{font-size:27px}}
  </style><header>Tabularium / Connections</header><main><h1>${escapeHtml(title)}</h1>${body}</main></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'same-origin',
        'x-frame-options': 'DENY',
        'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'none'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`,
      },
    },
  )
}
export function loginPage(returnTo: string) {
  const links = listEnabledInstances()
    .map(
      (p) =>
        `<p><a class="button" title="Continue with ${escapeHtml(p.displayName)}" href="/auth/${encodeURIComponent(p.id)}?return_to=${encodeURIComponent(returnTo)}">Continue with ${escapeHtml(p.displayName)}</a></p>`,
    )
    .join('')
  return page(
    'Sign in to connect',
    `<p>Sign in to your Tabularium account. You will review the requested permissions before granting access.</p>${links || '<section><p>No sign-in providers are currently enabled.</p><p class="muted">Ask your administrator to enable a sign-in provider in the Tabularium settings, then try again.</p></section>'}`,
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
