import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { parseManifestText } from '../../src/lib/manifest'
import { setExtensionsDelta } from '../../src/lib/manifest-schema'
import { createKind } from '../../src/lib/kinds'

describe('parseManifestText', () => {
  beforeEach(clearDb)

  it('parses a core-only JSON manifest', () => {
    const text = JSON.stringify({ name: 'my-plugin', version: '0.1.0', description: 'short', kind: 'theme' })
    const parsed = parseManifestText(text)
    expect(parsed.name).toBe('my-plugin')
    expect(parsed.kind).toBe('theme')
  })

  it('strips authored $schema before validating (IDE hint, not data)', () => {
    const text = JSON.stringify({
      $schema: 'https://tabularis.example/manifest.schema.json',
      name: 'x',
      version: '0.1.0',
    })
    const parsed = parseManifestText(text)
    expect(parsed.name).toBe('x')
    expect((parsed as Record<string, unknown>).$schema).toBeUndefined()
  })

  it('accepts a global extension field when defined', async () => {
    await setExtensionsDelta({ 'x-app': { type: 'string' } })
    const text = JSON.stringify({ name: 'x', version: '0.1.0', 'x-app': 'hello' })
    const parsed = parseManifestText(text) as Record<string, unknown>
    expect(parsed['x-app']).toBe('hello')
  })

  it('strips unknown fields silently (IDE schema rejects them; server stays lenient for fwd-compat)', () => {
    const text = JSON.stringify({ name: 'x', version: '0.1.0', 'x-unknown': 'oops' })
    const parsed = parseManifestText(text) as Record<string, unknown>
    expect(parsed.name).toBe('x')
    expect(parsed['x-unknown']).toBeUndefined()
  })

  it('routes validation through the per-kind override when kind matches', async () => {
    await setExtensionsDelta({ 'x-global': { type: 'string' } })
    await createKind({
      key: 'theme',
      label: 'Themes',
      description: null,
      extensionsSchema: { 'x-theme': { type: 'string' } },
    })
    const themed = JSON.stringify({ name: 'x', version: '0.1.0', kind: 'theme', 'x-theme': 'light' })
    const ok = parseManifestText(themed) as Record<string, unknown>
    expect(ok['x-theme']).toBe('light')

    const wrongField = JSON.stringify({ name: 'x', version: '0.1.0', kind: 'theme', 'x-global': 'hi' })
    const stripped = parseManifestText(wrongField) as Record<string, unknown>
    expect(stripped['x-global']).toBeUndefined()
  })

  it('throws ManifestValidationError with structured errors on type mismatch', async () => {
    const { ManifestValidationError } = await import('../../src/lib/manifest')
    await setExtensionsDelta({ 'x-app': { type: 'string' } })
    const text = JSON.stringify({ name: 'x', version: '0.1.0', 'x-app': 42 })
    try {
      parseManifestText(text)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError)
      const e = err as InstanceType<typeof ManifestValidationError>
      expect(e.errors.length).toBeGreaterThan(0)
      expect(e.errors[0].path).toContain('x-app')
    }
  })

  it('throws ManifestValidationError with code:parse on malformed JSON input', async () => {
    const { ManifestValidationError } = await import('../../src/lib/manifest')
    try {
      parseManifestText('{ not json')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError)
      const e = err as InstanceType<typeof ManifestValidationError>
      expect(e.errors[0].code).toBe('parse')
      expect(e.errors[0].path).toBe('/')
    }
  })
})
