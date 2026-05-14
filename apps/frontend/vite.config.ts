import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';

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
		proxy: {
			'/api': 'http://localhost:3000',
			'/auth': 'http://localhost:3000',
			'/openapi': 'http://localhost:3000',
		},
	},
	optimizeDeps: {
		// Svelte component libs stay out — vite-plugin-svelte handles .svelte at runtime.
		exclude: ['svelte-sonner', 'bits-ui', 'mode-watcher', '@lucide/svelte', 'carta-md'],
		// Force-bundle CJS-only deps that carta-md pulls in (no native ESM exports).
		include: ['extend', 'unist-util-visit', 'unist-util-stringify-position'],
	},
});
