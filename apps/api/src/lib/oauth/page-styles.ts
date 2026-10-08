// OAuth uses the registry's Inter/system font stack, surface palette and brand tokens.
export const pageStyles = `
:root {
  color-scheme: light dark;
  --background: light-dark(#ffffff, #08090a);
  --foreground: light-dark(#111827, #e5e7eb);
  --card: light-dark(#ffffff, #111214);
  --subtle: light-dark(#f9fafb, #16181a);
  --border: light-dark(#e5e7eb, #25282d);
  --muted: light-dark(#626b78, #9ca3af);
  --danger: light-dark(#b91c1c, #fca5a5);
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  background: var(--background);
  color: var(--foreground);
}
:root[data-theme=light] { color-scheme: light; }
:root[data-theme=dark] { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; min-height: 100%; overflow-x: clip; }
body { min-height: 100svh; display: flex; flex-direction: column; overflow-wrap: anywhere; }
a { color: inherit; text-decoration: none; }
button, a { -webkit-tap-highlight-color: transparent; }
:is(button, a, summary):focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 4px; }
.icon { width: 20px; height: 20px; flex: 0 0 auto; vertical-align: middle; }
.site-header { border-bottom: 1px solid var(--border); }
.header-inner { max-width: 1152px; height: 72px; padding: 0 24px; margin: auto; display: flex; align-items: center; gap: 20px; }
.brand { display: inline-flex; align-items: center; gap: 10px; min-width: 0; font-size: 17px; font-weight: 650; letter-spacing: -.025em; }
.brand-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex: 0 0 auto; border-radius: 7px; background: color-mix(in srgb, var(--brand-primary) 12%, transparent); color: var(--brand-primary); }
.brand-mark img { width: 100%; height: 100%; object-fit: contain; }
.brand-mark.custom { background: transparent; }
.header-actions { margin-left: auto; display: flex; align-items: center; gap: 18px; flex: 0 0 auto; }
.back-link { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 13px; }
.back-link:hover, .text-link:hover { color: var(--foreground); text-decoration: underline; text-underline-offset: 4px; }
.icon-button { border: 0; background: transparent; color: var(--muted); width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 6px; }
.icon-button:hover { background: var(--subtle); color: var(--foreground); }
[data-theme=dark] .moon-icon, [data-theme=light] .sun-icon { display: none; }
main { width: 100%; max-width: 528px; padding: 56px 24px 32px; margin: 0 auto; flex: 1; }
main.consent { max-width: 580px; }
main.connections { max-width: 680px; }
.page-heading { text-align: center; margin-bottom: 28px; }
.connection-symbol { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 24px; }
.connection-symbol .brand-mark, .app-mark { width: 52px; height: 52px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); display: inline-flex; align-items: center; justify-content: center; color: var(--muted); }
.app-mark { flex-shrink: 0; color: var(--brand-accent); background: color-mix(in srgb, var(--brand-accent) 6%, var(--card)); }
.connection-symbol .brand-mark { padding: 9px; color: var(--brand-primary); }
.connection-symbol .icon, .app-mark .icon { width: 24px; height: 24px; }
.connection-line { display: flex; align-items: center; gap: 4px; color: var(--muted); }
.connection-line::before, .connection-line::after { content: ''; width: 12px; height: 1px; background: var(--border); }
h1 { font-size: 28px; line-height: 1.2; letter-spacing: -.035em; font-weight: 650; margin: 0 0 12px; }
h2 { font-size: 15px; line-height: 1.4; letter-spacing: -.01em; margin: 0; font-weight: 600; }
h1, h2, p { min-width: 0; overflow-wrap: anywhere; }
p { margin: 0 0 18px; }
.lead { color: var(--muted); text-align: center; font-size: 15px; line-height: 1.65; margin-bottom: 28px; }
.lead strong { color: var(--foreground); font-weight: 550; }
.card { border: 1px solid var(--border); border-radius: 12px; background: var(--card); padding: 28px; }
.provider-list { display: grid; gap: 12px; }
.provider { width: 100%; min-height: 52px; padding: 12px 15px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border); border-radius: 7px; font-weight: 550; background: var(--background); transition: background-color .15s, border-color .15s; }
.provider:hover { background: var(--subtle); border-color: color-mix(in srgb, var(--brand-primary) 70%, var(--border)); }
.provider-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-image { width: 24px; height: 24px; object-fit: contain; flex: 0 0 auto; }
.provider > .icon { margin-left: auto; color: var(--muted); width: 17px; }
[data-theme=dark] .provider-image.github-default { filter: invert(1); }
.trust-note { display: flex; align-items: flex-start; justify-content: center; gap: 8px; color: var(--muted); font-size: 12px; line-height: 1.6; margin: 22px 0 0; }
.trust-note .icon { width: 16px; height: 16px; margin-top: 2px; }
.account { display: flex; align-items: center; gap: 10px; padding-bottom: 22px; margin-bottom: 22px; border-bottom: 1px solid var(--border); }
.account-icon, .permission-icon { width: 36px; height: 36px; background: var(--subtle); border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); flex: 0 0 auto; }
.account small { display: block; color: var(--muted); font-size: 12px; }
.account strong { font-weight: 550; }
.permissions { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 18px; }
.permissions li { display: flex; align-items: flex-start; gap: 12px; }
.permission-icon { color: var(--brand-primary); background: color-mix(in srgb, var(--brand-primary) 9%, var(--card)); }
.permission-text { padding-top: 1px; }
.permission-text strong { display: block; font-size: 14px; font-weight: 550; margin-bottom: 3px; }
.permission-text span { display: block; color: var(--muted); font-size: 12px; line-height: 1.6; }
.details { border-top: 1px solid var(--border); margin-top: 24px; padding-top: 18px; color: var(--muted); font-size: 12px; }
.details summary { cursor: pointer; display: flex; align-items: center; gap: 8px; min-height: 28px; list-style: none; }
.details summary::-webkit-details-marker { display: none; }
.details summary .icon { width: 16px; height: 16px; }
.details summary .chevron { margin-left: auto; }
.details[open] .chevron { transform: rotate(180deg); }
.details p { margin: 12px 0 0; }
code { font-family: ui-monospace, monospace; font-size: 11px; overflow-wrap: anywhere; }
.actions { display: flex; gap: 12px; margin-top: 24px; }
.button, button.action { min-height: 44px; padding: 11px 16px; border: 1px solid var(--border); border-radius: 6px; font: inherit; font-weight: 550; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; white-space: nowrap; background: var(--background); color: var(--foreground); }
.actions > button { flex: 1; }
.button:hover, button.action:hover { background: var(--subtle); }
button.primary { background: var(--brand-primary); color: var(--brand-on-primary); border-color: var(--brand-primary); }
button.primary:hover { background: color-mix(in srgb, var(--brand-primary) 90%, var(--foreground)); }
button.action .icon { width: 16px; height: 16px; }
button.danger { color: var(--danger); }
button:active, .provider:active { transform: translateY(1px); }
.text-link { color: var(--muted); font-size: 13px; }
.below-card { margin: 22px 0 0; text-align: center; }
.site-footer { padding: 24px; text-align: center; color: var(--muted); font-size: 12px; }
.site-footer p { margin: 0; }
.empty-state { padding: 12px 0; text-align: center; color: var(--muted); }
.empty-state .icon { width: 32px; height: 32px; margin-bottom: 12px; }
.empty-state strong { display: block; color: var(--foreground); margin-bottom: 8px; font-weight: 550; }
.empty-state p { font-size: 13px; margin: 0; }
.notice { display: flex; gap: 10px; border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin: 0 0 22px; background: var(--subtle); font-size: 13px; }
.notice .icon { color: var(--brand-success); }
.notice.error .icon { color: var(--danger); }
.notice p { margin: 0; }
.connection-card { margin-bottom: 16px; }
.connection-title { display: flex; align-items: center; gap: 12px; }
.connection-title .app-mark { width: 40px; height: 40px; border-radius: 8px; }
.connection-title .app-mark .icon { width: 20px; height: 20px; }
.connection-title > div { min-width: 0; }
.connection-title small { display: block; color: var(--muted); margin-top: 3px; font-size: 12px; }
.connection-card .permissions { margin: 22px 0; }
.connection-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px; }
.connection-footer .status { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; }
.status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--brand-success); }
@media(max-width: 560px) { .header-inner { height: 64px; padding: 0 20px; } .back-label { display: none; } .header-actions { gap: 6px; } main { padding: 36px 20px 24px; } h1 { font-size: 25px; } .card { padding: 22px; } .connection-footer { flex-wrap: wrap; } }
@media(prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; transform: none !important; } }
`
