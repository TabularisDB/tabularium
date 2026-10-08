import { randomBytes } from 'node:crypto'
import { listEnabledInstances } from '$lib/provider-instance'
export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export function page(title: string, body: string, script = '', callbackOrigin = '') {
  const nonce = randomBytes(18).toString('base64')
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Tabularium</title><style nonce="${nonce}">
  :root{color-scheme:light dark;font:16px/1.6 system-ui,sans-serif;background:light-dark(#f6f5f2,#18191b);color:light-dark(#24262b,#eee)}body{max-width:620px;margin:8vh auto;padding:24px}h1{line-height:1.2;font-size:30px}header{font-size:13px;letter-spacing:.12em;text-transform:uppercase}main{margin-top:36px}section{border:1px solid #8886;border-radius:12px;padding:24px;margin:20px 0}button,.button{display:inline-block;border:1px solid #8888;border-radius:7px;padding:10px 18px;font:inherit;cursor:pointer;text-decoration:none;background:light-dark(#fff,#292c31);color:inherit}button[value=allow]{background:#315cdc;color:#fff;border-color:#315cdc}input{display:block;box-sizing:border-box;width:100%;padding:10px;font:inherit;margin:4px 0 16px;border:1px solid #8888;border-radius:6px}code{overflow-wrap:anywhere;font-size:13px}a{color:light-dark(#234dbb,#a7bcff)}.muted{opacity:.7;font-size:14px}.error{color:light-dark(#a02020,#ffa5a5)}ul{padding-left:22px}li{margin:5px 0}.actions{display:flex;gap:12px;flex-wrap:wrap}</style><header>Tabularium / Connections</header><main><h1>${escapeHtml(title)}</h1>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'same-origin',
        'x-frame-options': 'DENY',
        'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`,
      },
    },
  )
}
export function loginPage(returnTo: string) {
  const links = listEnabledInstances()
    .map(
      (p) =>
        `<p><a class="button" href="/auth/${encodeURIComponent(p.id)}?return_to=${encodeURIComponent(returnTo)}">Continue with ${escapeHtml(p.displayName)}</a></p>`,
    )
    .join('')
  return page(
    'Sign in to connect',
    `<p>Sign in to your Tabularium account. You will review the requested permissions before granting access.</p>${links}<details><summary>Administrator recovery login</summary><form id="login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button><p id="error" class="error" role="alert"></p></form></details>`,
    `document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{const r=await fetch('/auth/email/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});if(!r.ok)throw new Error('Sign-in failed. Check your credentials.');location.reload()}catch(err){document.getElementById('error').textContent=err.message}})`,
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
