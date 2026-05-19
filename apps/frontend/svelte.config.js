import adapter from '@sveltejs/adapter-static'

const dev = process.env.NODE_ENV !== 'production'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
  },
  kit: {
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      fallback: 'index.html',
      strict: false,
    }),
    alias: {
      $components: 'src/lib/components',
      '$components/*': 'src/lib/components/*',
    },
    csp: dev
      ? undefined
      : {
          mode: 'auto',
          directives: {
            'default-src': ['self'],
            'script-src': ['self'],
            'style-src': ['self', 'unsafe-inline'],
            'img-src': ['self', 'data:', 'https:'],
            'font-src': ['self'],
            'connect-src': ['self'],
            'form-action': ['self'],
            'frame-ancestors': ['none'],
            'base-uri': ['self'],
            'object-src': ['none'],
          },
        },
  },
}

export default config
