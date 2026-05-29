import { Marked } from 'marked'
import { gfmHeadingId, getHeadingList } from 'marked-gfm-heading-id'
import markedShiki from 'marked-shiki'
import { createHighlighter, type Highlighter } from 'shiki'
import DOMPurify from 'isomorphic-dompurify'

const SHIKI_LANGS = [
  'bash',
  'shell',
  'sh',
  'json',
  'jsonc',
  'js',
  'javascript',
  'ts',
  'typescript',
  'tsx',
  'jsx',
  'yaml',
  'yml',
  'rust',
  'go',
  'python',
  'html',
  'css',
  'sql',
  'toml',
  'md',
  'markdown',
  'diff',
  'docker',
] as const
const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const

// Lazy singleton: createHighlighter loads the wasm engine + themes + langs once,
// then codeToHtml is sync per request. The bundled `shiki` package pulls all of
// its sub-packages itself, so we don't need to declare @shikijs/* as direct deps.
let highlighterPromise: Promise<Highlighter> | null = null
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
      langs: [...SHIKI_LANGS],
    })
  }
  return highlighterPromise
}

// Warm the highlighter on module load so the first request doesn't pay the
// engine + theme + language download cost (~300 ms in a fresh container).
void getHighlighter()

const marked = new Marked({ gfm: true, breaks: false })
marked.use(gfmHeadingId())
marked.use(
  markedShiki({
    async highlight(code, lang) {
      const safeLang = lang && SHIKI_LANGS.includes(lang) ? lang : 'text'
      const hl = await getHighlighter()
      return hl.codeToHtml(code, {
        lang: safeLang,
        themes: SHIKI_THEMES,
        defaultColor: 'light',
      })
    },
  }),
)

const ALLOWED_TAGS = [
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'kbd',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
  'span',
  'del',
  'div',
  'figure',
  'figcaption',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'aside',
  'main',
  'details',
  'summary',
  'small',
  'mark',
  'time',
  'picture',
  'source',
  'video',
  'audio',
]

const ALLOWED_ATTR = [
  'href',
  'title',
  'alt',
  'src',
  'srcset',
  'sizes',
  'class',
  'id',
  'rel',
  'target',
  'loading',
  'decoding',
  'width',
  'height',
  'role',
  'open',
  'datetime',
  'poster',
  'controls',
  'autoplay',
  'loop',
  'muted',
  'playsinline',
  'style',
  'tabindex',
]

export type Heading = { level: 2 | 3; id: string; text: string }

export async function renderMarkdown(raw: string): Promise<string> {
  if (!raw) return ''
  const html = await marked.parse(raw)
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

function stripTags(s: string): string {
  // marked-gfm-heading-id reports `text` as inline HTML (e.g. `<code>x</code>`
  // for `\`x\``), but TOC entries are rendered as plain text in the sidebar.
  // Strip tags and decode the handful of entities marked emits in headings.
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export async function renderMarkdownWithMeta(raw: string): Promise<{ html: string; headings: Heading[] }> {
  if (!raw) return { html: '', headings: [] }
  const html = await marked.parse(raw)
  const safe = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
  const raw_headings = getHeadingList()
  const headings: Heading[] = raw_headings
    .filter((h) => h.level === 2 || h.level === 3)
    .map((h) => ({ level: h.level as 2 | 3, id: h.id, text: stripTags(h.text) }))
  return { html: safe, headings }
}
