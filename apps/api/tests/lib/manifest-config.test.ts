import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import {
  getManifestConfig,
  validateManifestFile,
  validateAllowedFiles,
  validateSchemaUrl,
  MANIFEST_DEFAULTS,
} from '../../src/lib/manifest-config'

describe('validateManifestFile', () => {
  it('accepts dotfile and plain forms', () => {
    expect(() => validateManifestFile('.tabularium')).not.toThrow()
    expect(() => validateManifestFile('.tabularium.json')).not.toThrow()
    expect(() => validateManifestFile('.tabularium.yaml')).not.toThrow()
    expect(() => validateManifestFile('.tabularium.yml')).not.toThrow()
    expect(() => validateManifestFile('tabularium.yaml')).not.toThrow()
    expect(() => validateManifestFile('tabularis')).not.toThrow()
    expect(() => validateManifestFile('.tabularis')).not.toThrow()
    expect(() => validateManifestFile('plugin-spec.json')).not.toThrow()
  })

  it('rejects empty string', () => {
    expect(() => validateManifestFile('')).toThrow()
  })

  it('rejects uppercase letters', () => {
    expect(() => validateManifestFile('Tabularium')).toThrow()
  })

  it('rejects path traversal', () => {
    expect(() => validateManifestFile('../etc/passwd')).toThrow()
    expect(() => validateManifestFile('dir/file.yaml')).toThrow()
  })

  it('rejects unknown extensions', () => {
    expect(() => validateManifestFile('tabularium.txt')).toThrow()
    expect(() => validateManifestFile('tabularium.toml')).toThrow()
  })

  it('rejects underscores', () => {
    expect(() => validateManifestFile('plugin_spec')).toThrow()
  })

  it('enforces length cap', () => {
    expect(() => validateManifestFile('a'.repeat(61))).toThrow()
    expect(() => validateManifestFile('a'.repeat(60))).not.toThrow()
  })
})

describe('validateAllowedFiles', () => {
  it('accepts a non-empty list of valid filenames', () => {
    const out = validateAllowedFiles(['.tabularium', 'tabularium.yaml'])
    expect(out).toEqual(['.tabularium', 'tabularium.yaml'])
  })

  it('deduplicates entries', () => {
    const out = validateAllowedFiles(['.tabularium', '.tabularium'])
    expect(out).toEqual(['.tabularium'])
  })

  it('rejects non-arrays', () => {
    expect(() => validateAllowedFiles('foo')).toThrow()
    expect(() => validateAllowedFiles(null)).toThrow()
  })

  it('rejects empty arrays', () => {
    expect(() => validateAllowedFiles([])).toThrow()
  })

  it('rejects more than the max', () => {
    expect(() => validateAllowedFiles(Array(13).fill('.x'))).toThrow()
  })

  it('rejects invalid entries inside the array', () => {
    expect(() => validateAllowedFiles(['.tabularium', 'Bad Name!'])).toThrow()
  })
})

describe('validateSchemaUrl', () => {
  it('accepts http and https URLs', () => {
    expect(() => validateSchemaUrl('http://example.com')).not.toThrow()
    expect(() => validateSchemaUrl('https://tabularis.example/manifest.schema.json')).not.toThrow()
  })

  it('rejects non-http schemes', () => {
    expect(() => validateSchemaUrl('ftp://example.com')).toThrow()
    expect(() => validateSchemaUrl('file:///etc/passwd')).toThrow()
  })

  it('rejects relative or empty inputs', () => {
    expect(() => validateSchemaUrl('')).toThrow()
    expect(() => validateSchemaUrl('/manifest')).toThrow()
    expect(() => validateSchemaUrl('example.com')).toThrow()
  })
})

describe('getManifestConfig', () => {
  beforeEach(clearDb)

  it('returns defaults when nothing is set', () => {
    const cfg = getManifestConfig()
    expect(cfg.files).toEqual([...MANIFEST_DEFAULTS.files])
    expect(cfg.candidates.map((c) => c.path)).toEqual([...MANIFEST_DEFAULTS.files])
    expect(cfg.schemaUrl).toBe('http://localhost:3000/manifest.schema.json')
  })

  it('reflects a custom allowed_files list', async () => {
    await setSetting('manifest.allowed_files', JSON.stringify(['.tabularis', 'tabularis.yaml']))
    const cfg = getManifestConfig()
    expect(cfg.files).toEqual(['.tabularis', 'tabularis.yaml'])
  })

  it('classifies source by extension', async () => {
    await setSetting('manifest.allowed_files', JSON.stringify(['.x', 'x.json', 'x.yaml']))
    const cfg = getManifestConfig()
    expect(cfg.candidates).toEqual([
      { path: '.x', source: 'yaml' },
      { path: 'x.json', source: 'json' },
      { path: 'x.yaml', source: 'yaml' },
    ])
  })

  it('falls back to defaults when stored value is malformed JSON', async () => {
    await setSetting('manifest.allowed_files', 'not json')
    const cfg = getManifestConfig()
    expect(cfg.files).toEqual([...MANIFEST_DEFAULTS.files])
  })

  it('falls back to defaults when stored value is an empty array', async () => {
    await setSetting('manifest.allowed_files', '[]')
    const cfg = getManifestConfig()
    expect(cfg.files).toEqual([...MANIFEST_DEFAULTS.files])
  })

  it('filters invalid entries out of the stored list', async () => {
    await setSetting('manifest.allowed_files', JSON.stringify(['.good', 'Bad Name!', '..bad', '.also-good']))
    const cfg = getManifestConfig()
    expect(cfg.files).toEqual(['.good', '.also-good'])
  })

  it('reflects a custom schema URL', async () => {
    await setSetting('manifest.schema_url', 'https://tabularis.example/spec.json')
    const cfg = getManifestConfig()
    expect(cfg.schemaUrl).toBe('https://tabularis.example/spec.json')
  })
})
