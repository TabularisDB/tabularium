import { defaultTheme } from '@sveltepress/theme-default'
import { sveltepress } from '@sveltepress/vite'
import { defineConfig } from 'vite'
import navbar from './config/navbar'
import sidebar from './config/sidebar'

export default defineConfig({
  plugins: [
    sveltepress({
      theme: defaultTheme({
        navbar,
        sidebar,
        github: 'https://github.com/TabularisDB/tabularium',
        logo: '/favicon.svg',
        themeColor: { light: '#f2f2f2', dark: '#18181b' },
        highlighter: {
          languages: ['svelte', 'sh', 'bash', 'js', 'ts', 'json', 'yaml', 'md', 'markdown', 'docker', 'html', 'toml', 'rust'],
        },
      }),
      siteConfig: {
        title: 'Tabularium Docs',
        description: 'Documentation for the Tabularium self-hosted plugin registry.',
      },
    }),
  ],
  server: { port: 5191 },
})
