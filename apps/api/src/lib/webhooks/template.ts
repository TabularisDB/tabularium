// Logic-less template renderer for outbound webhooks.
//
//   {{plugin.name}}                     value, escaped for the target context
//   {{plugin.description | truncate:200}}
//   {{event.reason | default:"n/a"}}
//   {{plugin.name | html}}              HTML-escaped (then escaped for the context)
//   {{plugin | json}}                   JSON.stringify (quotes included), no further escaping
//   {{secrets.DISCORD_URL | raw}}       inserted verbatim
//   {{#if event.reason}}…{{else}}…{{/if}}
//
// The escape mode is chosen by the caller per field: a body sent as JSON
// escapes values as JSON string *contents* (authors write `"{{x}}"`), a URL
// percent-encodes, a header strips CR/LF. Paths resolve own properties only,
// so `constructor` / `__proto__` can never reach the prototype chain.

export type EscapeMode = 'json' | 'url' | 'header' | 'text'

export class TemplateError extends Error {}

type Filter = { name: string; arg?: string }
type Node =
  | { kind: 'text'; value: string }
  | { kind: 'var'; path: string; filters: Filter[] }
  | { kind: 'if'; path: string; then: Node[]; else: Node[] }

const MAX_OUTPUT = 256 * 1024
const TAG = /\{\{\s*([\s\S]*?)\s*\}\}/g
const PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/
const FILTERS = new Set(['raw', 'json', 'url', 'upper', 'lower', 'default', 'truncate', 'date', 'html'])

// Split on `|` outside double quotes.
function splitPipes(expr: string): string[] {
  const parts: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === '"' && expr[i - 1] !== '\\') quoted = !quoted
    if (ch === '|' && !quoted) {
      parts.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (quoted) throw new TemplateError(`unterminated string in "{{${expr}}}"`)
  parts.push(cur.trim())
  return parts
}

function parseFilter(raw: string): Filter {
  const idx = raw.indexOf(':')
  const name = (idx === -1 ? raw : raw.slice(0, idx)).trim()
  if (!FILTERS.has(name)) throw new TemplateError(`unknown filter "${name}"`)
  if (idx === -1) return { name }
  let arg = raw.slice(idx + 1).trim()
  if (arg.startsWith('"') && arg.endsWith('"') && arg.length >= 2) {
    arg = arg.slice(1, -1).replace(/\\"/g, '"')
  }
  return { name, arg }
}

function parseVar(expr: string): Node {
  const [path, ...filters] = splitPipes(expr)
  if (!path || !PATH.test(path)) throw new TemplateError(`invalid placeholder "{{${expr}}}"`)
  return { kind: 'var', path, filters: filters.map(parseFilter) }
}

export function parseTemplate(source: string): Node[] {
  const root: Node[] = []
  // Each frame is an open {{#if}}; `target` is the branch currently filling.
  const stack: Array<{ node: Extract<Node, { kind: 'if' }>; target: Node[]; sawElse: boolean }> = []
  const out = () => (stack.length ? stack[stack.length - 1].target : root)

  let last = 0
  for (const m of source.matchAll(TAG)) {
    const start = m.index ?? 0
    if (start > last) out().push({ kind: 'text', value: source.slice(last, start) })
    last = start + m[0].length
    const expr = m[1]

    if (expr.startsWith('#if ')) {
      const path = expr.slice(4).trim()
      if (!PATH.test(path)) throw new TemplateError(`invalid condition "{{${expr}}}"`)
      const node = { kind: 'if' as const, path, then: [] as Node[], else: [] as Node[] }
      out().push(node)
      stack.push({ node, target: node.then, sawElse: false })
    } else if (expr === 'else') {
      const frame = stack[stack.length - 1]
      if (!frame || frame.sawElse) throw new TemplateError('unexpected {{else}}')
      frame.sawElse = true
      frame.target = frame.node.else
    } else if (expr === '/if') {
      if (!stack.pop()) throw new TemplateError('unexpected {{/if}}')
    } else {
      out().push(parseVar(expr))
    }
  }
  if (stack.length) throw new TemplateError('unclosed {{#if}}')
  if (last < source.length) out().push({ kind: 'text', value: source.slice(last) })
  return root
}

export function resolvePath(ctx: unknown, path: string): unknown {
  let cur: unknown = ctx
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, key)) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function escape(s: string, mode: EscapeMode): string {
  switch (mode) {
    case 'json':
      return JSON.stringify(s).slice(1, -1)
    case 'url':
      return encodeURIComponent(s)
    case 'header':
      return s.replace(/[\r\n]+/g, ' ')
    case 'text':
      return s
  }
}

function applyVar(node: Extract<Node, { kind: 'var' }>, ctx: unknown, mode: EscapeMode, missing: Set<string>): string {
  let value = resolvePath(ctx, node.path)
  if (value === undefined) missing.add(node.path)
  let verbatim = false
  for (const f of node.filters) {
    switch (f.name) {
      case 'raw':
        verbatim = true
        break
      case 'json':
        value = JSON.stringify(value ?? null)
        verbatim = true
        break
      case 'url':
        value = encodeURIComponent(stringify(value))
        verbatim = true
        break
      case 'html':
        value = stringify(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
        break
      case 'upper':
        value = stringify(value).toUpperCase()
        break
      case 'lower':
        value = stringify(value).toLowerCase()
        break
      case 'default':
        if (!truthy(value)) value = f.arg ?? ''
        break
      case 'truncate': {
        const n = Number(f.arg)
        const s = stringify(value)
        if (Number.isFinite(n) && n > 0 && s.length > n) value = s.slice(0, Math.max(0, n - 1)) + '…'
        break
      }
      case 'date': {
        const d = typeof value === 'number' ? new Date(value) : null
        value = d && !Number.isNaN(d.getTime()) ? d.toISOString() : stringify(value)
        break
      }
    }
  }
  const s = stringify(value)
  // header context always strips CR/LF, even for `raw`, to prevent header injection.
  if (mode === 'header') return escape(s, 'header')
  return verbatim ? s : escape(s, mode)
}

function renderNodes(nodes: Node[], ctx: unknown, mode: EscapeMode, missing: Set<string>): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text') out += node.value
    else if (node.kind === 'var') out += applyVar(node, ctx, mode, missing)
    else out += renderNodes(truthy(resolvePath(ctx, node.path)) ? node.then : node.else, ctx, mode, missing)
    if (out.length > MAX_OUTPUT) throw new TemplateError(`rendered output exceeds ${MAX_OUTPUT} bytes`)
  }
  return out
}

export type RenderResult = { output: string; missing: string[] }

export function renderTemplate(source: string, ctx: unknown, mode: EscapeMode): RenderResult {
  const missing = new Set<string>()
  const output = renderNodes(parseTemplate(source), ctx, mode, missing)
  return { output, missing: [...missing] }
}

// Throws TemplateError on syntax errors; used to validate on save.
export function validateTemplate(source: string): void {
  parseTemplate(source)
}
