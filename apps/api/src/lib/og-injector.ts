import { resolve } from 'node:path'
import { db } from '$db'
import { cache, isString } from '$lib/cache'

const INDEX_HTML_PATH = resolve('../frontend/dist/index.html')
const INDEX_CACHE_KEY = 'frontend:index-html'
const INDEX_TTL = 60

async function loadIndexHtml(): Promise<string> {
  const cached = await cache().get<string>(INDEX_CACHE_KEY, isString)
  if (cached) return cached
  const html = await Bun.file(INDEX_HTML_PATH).text()
  await cache().set(INDEX_CACHE_KEY, html, INDEX_TTL)
  return html
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export async function renderPluginHtml(slug: string, origin: string): Promise<string | null> {
  const plugin = await db.query.plugins.findFirst({ where: { id: slug } })
  if (!plugin || plugin.status !== 'approved') return null

  const html = await loadIndexHtml()
  const canonicalUrl = `${origin}/plugins/${plugin.id}`
  const description = plugin.description.slice(0, 280)
  const image = plugin.iconUrl ?? `${origin}/favicon.png`
  const title = `${plugin.name} · plugin registry`

  const tags = `
		<title>${escapeHtml(title)}</title>
		<meta name="description" content="${escapeAttr(description)}" />
		<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
		<meta property="og:type" content="website" />
		<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
		<meta property="og:title" content="${escapeAttr(title)}" />
		<meta property="og:description" content="${escapeAttr(description)}" />
		<meta property="og:image" content="${escapeAttr(image)}" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="${escapeAttr(title)}" />
		<meta name="twitter:description" content="${escapeAttr(description)}" />
		<meta name="twitter:image" content="${escapeAttr(image)}" />
`
  // Inject just before </head>. If the marker isn't found, return null so the SPA fallback wins.
  const headCloseIdx = html.indexOf('</head>')
  if (headCloseIdx < 0) return null
  return html.slice(0, headCloseIdx) + tags + html.slice(headCloseIdx)
}
