// Admin routes render fully client-side.
//
// SvelteKit's SSR `fetch` from `load.ts` doesn't go through vite's dev proxy
// for non-internal paths — instead it hits the SvelteKit handler in-process,
// which under adapter-static + `fallback: index.html` returns the SPA shell
// (200 HTML) for `/api/*` paths the SvelteKit app doesn't own. The downstream
// `res.json()` then fails with `JSON parse error: Unrecognized token '<'`.
//
// Disabling SSR for the whole admin section makes loads run in the browser,
// where `fetch` does hit vite's proxy and reaches the API correctly. Admin is
// auth-gated anyway, so there is no SSR/SEO value to give up.
export const ssr = false
