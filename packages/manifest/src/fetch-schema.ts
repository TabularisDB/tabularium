export type FetchSchemaOptions = {
  kind?: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}

export async function fetchSchema(
  registryBaseUrl: string,
  options: FetchSchemaOptions = {},
): Promise<Record<string, unknown>> {
  const base = registryBaseUrl.replace(/\/+$/, '')
  const qs = options.kind ? `?kind=${encodeURIComponent(options.kind)}` : ''
  const url = `${base}/manifest.schema.json${qs}`
  const fetchImpl = options.fetch ?? globalThis.fetch
  const res = await fetchImpl(url, { signal: options.signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`fetchSchema ${url}: HTTP ${res.status}${body ? ` — ${body.slice(0, 500)}` : ''}`)
  }
  return (await res.json()) as Record<string, unknown>
}
