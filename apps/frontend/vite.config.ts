import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'cookie', 'baseLocale'],
    }),
    sveltekit(),
  ],
  server: {
    port: 5180,
    // Defaults to localhost (bare-metal dev). Under compose/Tilt the API lives
    // at http://api:3000 — set API_PROXY_TARGET to point there.
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
      '/auth': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
      '/openapi': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
      // Token-authenticated email preference endpoints
      // (GET/PUT /email/preferences/[token], POST one-click).
      // The SPA page lives at /email/unsubscribe/[token] — different prefix, no conflict.
      '/email/preferences': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
      // Static-plugin-served upload assets (logos, favicons, plugin images).
      // Without this, the browser hits vite for /uploads/* and gets the SPA
      // fallback index.html — broken images in the admin previews and in the
      // public header/footer.
      '/uploads': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
  optimizeDeps: {
    exclude: ['svelte-sonner', 'bits-ui', 'mode-watcher', '@lucide/svelte', 'svelte-jsoneditor'],
  },
  ssr: {
    noExternal: ['svelte-jsoneditor'],
  },
})
