import type { PageServerLoad } from './$types'

type FieldDoc = {
  key: string
  type: string
  required: boolean
  description: string | null
  enumValues?: string[]
  format?: string
  deprecated?: boolean
}

type PositionMarker =
  | 'page_top'
  | 'page_bottom'
  | 'before_core'
  | 'after_core'
  | 'before_extensions'
  | 'after_extensions'
  | 'before_kinds'
  | 'after_kinds'
  | 'before_api'
  | 'after_api'
  | { kind: string; slot: 'before' | 'after' }

type CustomSection = {
  id: string
  title: string | null
  bodyHtml: string
  position: PositionMarker
}

type KindDocSection = {
  key: string
  label: string
  description: string | null
  publicPageUrl: string | null
  extensionFields: FieldDoc[]
  prosePreHtml: string | null
  prosePostHtml: string | null
}

type KindExample = { kindKey: string; yaml: string; json: string }

type PluginDocs = {
  meta: { generatedAt: number; schemaSourceUrl: string }
  intro: { bodyHtml: string | null }
  outro: { bodyHtml: string | null }
  customSections: CustomSection[]
  coreFields: FieldDoc[]
  globalExtensions: FieldDoc[]
  kinds: KindDocSection[]
  examples: { perKind: KindExample[] }
  apiReference: { openapiSpecUrl: string; openapiUiUrl: string }
}

export const load: PageServerLoad = async ({ url, fetch }) => {
  const requested = url.searchParams.get('locale') ?? ''
  const qs = requested ? `?locale=${encodeURIComponent(requested)}` : ''
  const res = await fetch(`/api/docs/plugin-development${qs}`)
  if (!res.ok) {
    throw new Error(`Docs load failed: ${res.status}`)
  }
  const docs = (await res.json()) as PluginDocs
  return { docs }
}
