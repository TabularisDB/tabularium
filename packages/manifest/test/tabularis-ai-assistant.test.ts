import { describe, expect, it } from 'bun:test'
import { buildSchema, ManifestSchema, validateManifest, type ExtensionsDelta } from '../src/index'
import preset from '../../../deploy/tabularis/ai-assistant-kind.json'

const schema = buildSchema({
  coreSchema: ManifestSchema as never,
  kindOverrides: { 'ai-assistant': preset.extensionsSchema as ExtensionsDelta },
  kind: 'ai-assistant',
})

describe('Tabularis AI assistant kind preset', () => {
  it('accepts the declarative Runcrate example with a stable id and display name', () => {
    const manifest = JSON.parse(preset.customExample.json) as Record<string, unknown>
    expect(validateManifest(manifest, schema).ok).toBe(true)
  })

  it('requires the provider contract and excludes executable extension fields', () => {
    const manifest = JSON.parse(preset.customExample.json) as Record<string, unknown>
    for (const key of ['executable', 'interpreter', 'ui_extensions']) {
      expect(validateManifest({ ...manifest, [key]: 'forbidden' }, schema).ok).toBe(false)
    }
    const missing = { ...manifest }
    delete missing.ai_assistant
    expect(validateManifest(missing, schema).ok).toBe(false)
    const contract = manifest.ai_assistant as Record<string, unknown>
    const incomplete = { ...contract }
    delete incomplete.generate
    expect(validateManifest({ ...manifest, ai_assistant: incomplete }, schema).ok).toBe(false)
  })
})
