import { parse as parseYaml } from 'yaml'

export type ManifestSource = 'tabularium.yaml' | 'tabularium.json'

export class ParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'ParseError'
  }
}

export function sniffSource(text: string): ManifestSource {
  const head = text.replace(/^﻿/, '').trimStart()
  return head.startsWith('{') || head.startsWith('[') ? 'tabularium.json' : 'tabularium.yaml'
}

export function parseManifest(text: string, source: ManifestSource): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = source === 'tabularium.json' ? JSON.parse(text) : parseYaml(text)
  } catch (err) {
    throw new ParseError(
      `Failed to parse ${source}: ${err instanceof Error ? err.message : String(err)}`,
      err,
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParseError('Manifest root must be an object')
  }
  const obj = parsed as Record<string, unknown>
  if ('$schema' in obj) delete obj.$schema
  return obj
}
