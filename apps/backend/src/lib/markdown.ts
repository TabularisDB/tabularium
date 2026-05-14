import { Marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

const marked = new Marked({
  async: false,
  gfm: true,
  breaks: false,
})

/**
 * Tags we let through the sanitizer. `tabularium-widget` is a custom element the
 * frontend hydrates with a Svelte component (see lib/widgets).
 */
const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'kbd', 'li', 'ol', 'p', 'pre', 's', 'strong', 'sub', 'sup', 'table',
  'tbody', 'td', 'th', 'thead', 'tr', 'ul', 'span', 'del', 'div', 'figure', 'figcaption',
  'tabularium-widget',
]

const ALLOWED_ATTR = [
  'href', 'title', 'alt', 'src', 'class', 'id', 'rel', 'target', 'loading', 'width', 'height',
  // Widget attributes — all values are coerced to strings and rendered as `data-*`.
  'name', 'data-name', 'data-limit', 'data-cols', 'data-category', 'data-tag', 'data-sort',
  'data-heading', 'data-show-counts', 'data-variant',
]

const WIDGET_ATTRS = new Set(['name', 'limit', 'cols', 'category', 'tag', 'sort', 'heading', 'show-counts', 'variant'])

DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'tabularium-widget') return
  const el = node as { nodeType?: number; attributes?: ArrayLike<{ name: string; value: string }>; setAttribute?: (k: string, v: string) => void; removeAttribute?: (k: string) => void }
  if (el.nodeType !== 1 || !el.attributes || !el.setAttribute || !el.removeAttribute) return
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-') || !WIDGET_ATTRS.has(attr.name)) continue
    el.setAttribute(`data-${attr.name}`, attr.value)
    el.removeAttribute(attr.name)
  }
})

export function renderMarkdown(raw: string): string {
  if (!raw) return ''
  const html = marked.parse(raw) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    CUSTOM_ELEMENT_HANDLING: {
      tagNameCheck: /^tabularium-widget$/,
      attributeNameCheck: /^(data-.*|name|limit|cols|category|tag|sort|heading|show-counts|variant)$/,
      allowCustomizedBuiltInElements: false,
    },
  })
}

/**
 * Names the frontend knows how to mount. Pages that reference an unknown widget
 * will render the element but it'll be empty in the DOM.
 */
export const KNOWN_WIDGETS = [
  'featured-plugins',
  'recent-plugins',
  'popular-plugins',
  'plugin-grid',
  'popular-requests',
  'stats',
] as const
export type WidgetName = (typeof KNOWN_WIDGETS)[number]
