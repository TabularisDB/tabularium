import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import {
  getManifestConfig,
  validateManifestFilename,
  validateSchemaUrl,
} from '../../src/lib/manifest-config'

describe('validateManifestFilename', () => {
  it('accepts simple slugs', () => {
    expect(() => validateManifestFilename('tabularium')).not.toThrow()
    expect(() => validateManifestFilename('tabularis')).not.toThrow()
    expect(() => validateManifestFilename('a')).not.toThrow()
    expect(() => validateManifestFilename('plugin-spec')).not.toThrow()
    expect(() => validateManifestFilename('x1')).not.toThrow()
  })

  it('rejects empty string', () => {
    expect(() => validateManifestFilename('')).toThrow()
  })

  it('rejects uppercase letters', () => {
    expect(() => validateManifestFilename('Tabularium')).toThrow()
  })

  it('rejects leading hyphen or digit boundary', () => {
    expect(() => validateManifestFilename('-bad')).toThrow()
  })

  it('rejects underscores and dots', () => {
    expect(() => validateManifestFilename('plugin_spec')).toThrow()
    expect(() => validateManifestFilename('plugin.spec')).toThrow()
  })

  it('rejects strings longer than 40 chars', () => {
    expect(() => validateManifestFilename('a'.repeat(41))).toThrow()
  })

  it('accepts the 40-char limit', () => {
    expect(() => validateManifestFilename('a'.repeat(40))).not.toThrow()
  })
})

describe('validateSchemaUrl', () => {
  it('accepts http and https URLs', () => {
    expect(() => validateSchemaUrl('http://example.com')).not.toThrow()
    expect(() => validateSchemaUrl('https://tabularis.example/api/manifest')).not.toThrow()
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
    expect(cfg.filename).toBe('tabularium')
    expect(cfg.paths).toEqual([
      '.tabularium',
      '.tabularium.yaml',
      '.tabularium.yml',
      '.tabularium.json',
    ])
    expect(cfg.schemaUrl).toBe('http://localhost:3000/api/manifest')
  })

  it('reflects a custom filename setting', async () => {
    await setSetting('manifest.filename', 'tabularis')
    const cfg = getManifestConfig()
    expect(cfg.filename).toBe('tabularis')
    expect(cfg.paths).toEqual([
      '.tabularis',
      '.tabularis.yaml',
      '.tabularis.yml',
      '.tabularis.json',
    ])
  })

  it('falls back to default when stored filename is invalid', async () => {
    await setSetting('manifest.filename', 'Bad Name!')
    const cfg = getManifestConfig()
    expect(cfg.filename).toBe('tabularium')
  })

  it('falls back to default when stored filename is too long', async () => {
    await setSetting('manifest.filename', 'a'.repeat(41))
    const cfg = getManifestConfig()
    expect(cfg.filename).toBe('tabularium')
  })

  it('reflects a custom schema URL', async () => {
    await setSetting('manifest.schema_url', 'https://tabularis.example/spec')
    const cfg = getManifestConfig()
    expect(cfg.schemaUrl).toBe('https://tabularis.example/spec')
  })
})
