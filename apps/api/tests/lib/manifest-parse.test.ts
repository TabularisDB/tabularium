import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { parseManifestText } from '../../src/lib/manifest'
import { setExtensionsDelta } from '../../src/lib/manifest-schema'
import { createKind } from '../../src/lib/kinds'

describe('parseManifestText', () => {
  beforeEach(clearDb)

  it('parses a core-only YAML manifest', () => {
    const text = `name: my-plugin\ndescription: short\nkind: theme\n`
    const parsed = parseManifestText(text, 'tabularium.yaml')
    expect(parsed.name).toBe('my-plugin')
    expect(parsed.kind).toBe('theme')
  })

  it('strips authored $schema before validating (IDE hint, not data)', () => {
    const text = `$schema: https://tabularis.example/manifest.schema.json\nname: x\n`
    const parsed = parseManifestText(text, 'tabularium.yaml')
    expect(parsed.name).toBe('x')
    expect((parsed as Record<string, unknown>).$schema).toBeUndefined()
  })

  it('accepts a global extension field when defined', async () => {
    await setExtensionsDelta({ 'x-app': { type: 'string' } })
    const text = `name: x\nx-app: hello\n`
    const parsed = parseManifestText(text, 'tabularium.yaml') as Record<string, unknown>
    expect(parsed['x-app']).toBe('hello')
  })

  it('strips unknown fields silently (IDE schema rejects them; server stays lenient for fwd-compat)', () => {
    const text = `name: x\nx-unknown: oops\n`
    const parsed = parseManifestText(text, 'tabularium.yaml') as Record<string, unknown>
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
    const themed = `name: x\nkind: theme\nx-theme: light\n`
    const ok = parseManifestText(themed, 'tabularium.yaml') as Record<string, unknown>
    expect(ok['x-theme']).toBe('light')

    // x-global is part of the GLOBAL extensions but the kind override replaces them.
    // Server strips it silently; the public per-kind schema would warn the IDE.
    const wrongField = `name: x\nkind: theme\nx-global: hi\n`
    const stripped = parseManifestText(wrongField, 'tabularium.yaml') as Record<string, unknown>
    expect(stripped['x-global']).toBeUndefined()
  })

  it('throws ManifestValidationError with structured errors on type mismatch', async () => {
    const { ManifestValidationError } = await import('../../src/lib/manifest')
    await setExtensionsDelta({ 'x-app': { type: 'string' } })
    const text = `name: x\nx-app: 42\n` // 42 is a number, not a string
    try {
      parseManifestText(text, 'tabularium.yaml')
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
      parseManifestText('{ not json', 'tabularium.json')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError)
      const e = err as InstanceType<typeof ManifestValidationError>
      expect(e.errors[0].code).toBe('parse')
      expect(e.errors[0].path).toBe('/')
    }
  })
})
