import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5180,
		proxy: {
			'/api': 'http://localhost:3000',
			'/auth': 'http://localhost:3000',
			'/openapi': 'http://localhost:3000',
		},
	},
	optimizeDeps: {
		// Vite's esbuild pre-bundler can't read .svelte files; keep Svelte component
		// libs out of pre-bundling so the vite-plugin-svelte handles them at runtime.
		exclude: ['svelte-sonner', 'bits-ui', 'mode-watcher', '@lucide/svelte', 'carta-md'],
	},
});
