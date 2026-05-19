import { getSetting } from './settings'
import { env } from './env'

const DEFAULT_FILES = ['.tabularium', '.tabularium.json', 'tabularium.yaml', 'tabularium.json']

const FILE_RE = /^\.?[a-z][a-z0-9-]*(\.(yaml|yml|json))?$/
const FILE_MAX = 60
const MAX_FILES = 12

export type ManifestSource = 'yaml' | 'json'

export type ManifestCandidate = {
  path: string
  source: ManifestSource
}

export type ManifestConfig = {
  files: string[]
  candidates: ManifestCandidate[]
  schemaUrl: string
}

function classify(path: string): ManifestSource {
  return path.endsWith('.json') ? 'json' : 'yaml'
}

function readAllowedFiles(): string[] {
  const raw = getSetting('manifest.allowed_files')
  if (!raw) return DEFAULT_FILES
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_FILES
    const safe = parsed.filter((s): s is string => typeof s === 'string' && s.length <= FILE_MAX && FILE_RE.test(s))
    return safe.length > 0 ? Array.from(new Set(safe)).slice(0, MAX_FILES) : DEFAULT_FILES
  } catch {
    return DEFAULT_FILES
  }
}

export function getManifestConfig(): ManifestConfig {
  const files = readAllowedFiles()
  const candidates = files.map((path) => ({ path, source: classify(path) }))
  const schemaUrl = getSetting('manifest.schema_url') ?? `${env.BASE_URL.replace(/\/$/, '')}/manifest.schema.json`
  return { files, candidates, schemaUrl }
}

export function validateManifestFile(input: string): void {
  if (!input || input.length > FILE_MAX || !FILE_RE.test(input)) {
    throw new Error(`filename must match ${FILE_RE} (max ${FILE_MAX} chars)`)
  }
}

export function validateAllowedFiles(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('allowed_files must be an array of strings')
  if (input.length === 0) throw new Error('allowed_files must not be empty')
  if (input.length > MAX_FILES) throw new Error(`allowed_files may contain at most ${MAX_FILES} entries`)
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') throw new Error('allowed_files entries must be strings')
    validateManifestFile(raw)
    out.push(raw)
  }
  return Array.from(new Set(out))
}

export function validateSchemaUrl(input: string): void {
  if (!/^https?:\/\/.+/.test(input)) {
    throw new Error('schema_url must be an absolute http(s) URL')
  }
}

export const MANIFEST_DEFAULTS = {
  files: DEFAULT_FILES,
  fileRegex: FILE_RE.source,
  maxFiles: MAX_FILES,
} as const
