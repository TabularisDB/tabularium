import { getSetting } from './settings'
import { env } from './env'

const DEFAULT_FILENAME = 'tabularium'
const FILENAME_RE = /^[a-z0-9][a-z0-9-]*$/
const FILENAME_MAX = 40

export type ManifestConfig = {
  filename: string
  paths: string[]
  schemaUrl: string
}

export function getManifestConfig(): ManifestConfig {
  const raw = getSetting('manifest.filename')
  const filename = raw && FILENAME_RE.test(raw) && raw.length <= FILENAME_MAX ? raw : DEFAULT_FILENAME
  const paths = [
    `.${filename}`,
    `.${filename}.yaml`,
    `.${filename}.yml`,
    `.${filename}.json`,
  ]
  const schemaUrl = getSetting('manifest.schema_url')
    ?? `${env.BASE_URL.replace(/\/$/, '')}/api/manifest`
  return { filename, paths, schemaUrl }
}

export function validateManifestFilename(input: string): void {
  if (!input || input.length > FILENAME_MAX || !FILENAME_RE.test(input)) {
    throw new Error(`filename must match ${FILENAME_RE} (max ${FILENAME_MAX} chars)`)
  }
}

export function validateSchemaUrl(input: string): void {
  if (!/^https?:\/\/.+/.test(input)) {
    throw new Error('schema_url must be an absolute http(s) URL')
  }
}
