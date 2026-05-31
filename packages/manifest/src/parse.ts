export class ParseError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

export function parseManifest(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new ParseError(`Failed to parse manifest: ${err instanceof Error ? err.message : String(err)}`, err)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParseError('Manifest root must be an object')
  }
  const obj = parsed as Record<string, unknown>
  if ('$schema' in obj) delete obj.$schema
  return obj
}
