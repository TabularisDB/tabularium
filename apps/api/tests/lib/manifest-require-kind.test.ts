import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { parseManifestText, ManifestValidationError } from '../../src/lib/manifest'
import { createKind } from '../../src/lib/kinds'
import { setSetting, deleteSetting } from '../../src/lib/settings'

const BASE = `name: my-plugin
description: hello
category: integration
version: 1.0.0
`

describe('parseManifestText — manifest.require_kind policy', () => {
  beforeEach(clearDb)

  it('accepts a kind-less manifest when policy is off', () => {
    expect(parseManifestText(BASE, 'yaml').name).toBe('my-plugin')
  })

  it('accepts a kind-less manifest when policy is on but no kinds are configured', async () => {
    await setSetting('manifest.require_kind', '1')
    expect(parseManifestText(BASE, 'yaml').name).toBe('my-plugin')
  })

  it('rejects a kind-less manifest when policy is on AND at least one kind exists', async () => {
    await createKind({ key: 'driver', label: 'Drivers', description: null })
    await setSetting('manifest.require_kind', '1')
    try {
      parseManifestText(BASE, 'yaml')
      throw new Error('expected ManifestValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError)
      const errors = (err as ManifestValidationError).errors
      expect(errors.some((e) => e.path === '/kind' && e.code === 'required')).toBe(true)
    }
  })

  it('rejects an unknown kind when policy is on', async () => {
    await createKind({ key: 'driver', label: 'Drivers', description: null })
    await setSetting('manifest.require_kind', '1')
    try {
      parseManifestText(`${BASE}kind: theme\n`, 'yaml')
      throw new Error('expected ManifestValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError)
      const errors = (err as ManifestValidationError).errors
      expect(errors.some((e) => e.path === '/kind' && e.code === 'enum')).toBe(true)
    }
  })

  it('accepts a manifest with a configured kind when policy is on', async () => {
    await createKind({ key: 'driver', label: 'Drivers', description: null })
    await setSetting('manifest.require_kind', '1')
    const m = parseManifestText(`${BASE}kind: driver\n`, 'yaml')
    expect(m.kind).toBe('driver')
  })

  it('off-toggle short-circuits even with an unknown kind in the manifest', async () => {
    await createKind({ key: 'driver', label: 'Drivers', description: null })
    await deleteSetting('manifest.require_kind')
    const m = parseManifestText(`${BASE}kind: anything\n`, 'yaml')
    expect(m.kind).toBe('anything')
  })
})
