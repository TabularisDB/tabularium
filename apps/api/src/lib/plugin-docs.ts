import type { Locale } from './i18n'

export type FieldDoc = {
  key: string
  type: string
  required: boolean
  description: string | null
  enumValues?: string[]
  format?: string
  deprecated?: boolean
}

type FlattenInput = {
  schema: Record<string, unknown>
  requiredOverride: string[] | null
  locale: Locale
}

function deriveType(node: Record<string, unknown>): { type: string; enumValues?: string[] } {
  if (Array.isArray(node.enum)) {
    return { type: 'enum', enumValues: node.enum.filter((v): v is string => typeof v === 'string') }
  }
  const t = node.type
  if (t === 'array') {
    const items = node.items as Record<string, unknown> | undefined
    const itemType = items ? deriveType(items).type : 'unknown'
    return { type: `array<${itemType}>` }
  }
  if (typeof t === 'string') return { type: t }
  if (Array.isArray(t)) return { type: t.join('|') }
  if (node.properties && typeof node.properties === 'object') return { type: 'object' }
  return { type: 'unknown' }
}

function pickLocalizedDescription(node: Record<string, unknown>, locale: Locale): string | null {
  const translations = node['x-translations']
  if (translations && typeof translations === 'object' && !Array.isArray(translations)) {
    const val = (translations as Record<string, unknown>)[locale]
    if (typeof val === 'string' && val.length > 0) return val
  }
  if (typeof node.description === 'string') return node.description
  return null
}

export function flattenSchemaProps(input: FlattenInput): FieldDoc[] {
  const props = (input.schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const required = input.requiredOverride ?? (input.schema.required as string[] | undefined) ?? []
  const requiredSet = new Set(required)
  const out: FieldDoc[] = []
  for (const [key, node] of Object.entries(props)) {
    const { type, enumValues } = deriveType(node)
    out.push({
      key,
      type,
      required: requiredSet.has(key),
      description: pickLocalizedDescription(node, input.locale),
      ...(enumValues ? { enumValues } : {}),
      ...(typeof node.format === 'string' ? { format: node.format } : {}),
      ...(node.deprecated === true ? { deprecated: true } : {}),
    })
  }
  return out
}
