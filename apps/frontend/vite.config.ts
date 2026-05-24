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
    },
  },
  optimizeDeps: {
    exclude: ['svelte-sonner', 'bits-ui', 'mode-watcher', '@lucide/svelte', 'svelte-jsoneditor'],
  },
  ssr: {
    noExternal: ['svelte-jsoneditor'],
  },
})
