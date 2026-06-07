import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { manifestPatch } from '../../src/lib/manifest-apply'
import type { ResolvedManifest } from '../../src/lib/manifest'
import { setSetting, deleteSetting } from '../../src/lib/settings'

function buildManifest(extras: Record<string, unknown>): ResolvedManifest {
  return {
    raw: '',
    parsed: {
      name: 'p',
      description: 'd',
      version: '1.0.0',
      ...extras,
    } as ResolvedManifest['parsed'],
    readmeMarkdown: null,
    readmeLocales: null,
  }
}

describe('manifestPatch — requires capture', () => {
  beforeEach(clearDb)

  it('serializes a non-empty requires[] into the patch column', () => {
    const patch = manifestPatch(
      buildManifest({
        requires: [{ id: 'theme-engine', version: '^2.0.0' }, { id: 'analytics', optional: true }],
      }),
      { repoBase: '', version: null },
    )
    expect(patch.requires).not.toBeNull()
    const decoded = JSON.parse(patch.requires!)
    expect(decoded).toEqual([{ id: 'theme-engine', version: '^2.0.0' }, { id: 'analytics', optional: true }])
  })

  it('leaves requires NULL when the manifest does not declare any', () => {
    const patch = manifestPatch(buildManifest({}), { repoBase: '', version: null })
    expect(patch.requires).toBeNull()
  })

  it('leaves requires NULL when the manifest declares an empty array', () => {
    const patch = manifestPatch(buildManifest({ requires: [] }), { repoBase: '', version: null })
    expect(patch.requires).toBeNull()
  })

  it('silently drops requires[] when plugins.requires_allowed=false', async () => {
    await setSetting('plugins.requires_allowed', 'false')
    const patch = manifestPatch(
      buildManifest({ requires: [{ id: 'theme-engine' }] }),
      { repoBase: '', version: null },
    )
    expect(patch.requires).toBeNull()
    // Sanity check: other fields still flow through.
    expect(patch.tags).toBeNull()
    expect(patch.manifestVersion).toBeNull()
    await deleteSetting('plugins.requires_allowed')
  })

  it('persists requires[] when the setting is explicitly "true"', async () => {
    await setSetting('plugins.requires_allowed', 'true')
    const patch = manifestPatch(
      buildManifest({ requires: [{ id: 'theme-engine' }] }),
      { repoBase: '', version: null },
    )
    expect(patch.requires).not.toBeNull()
    const decoded = JSON.parse(patch.requires!)
    expect(decoded).toEqual([{ id: 'theme-engine' }])
    await deleteSetting('plugins.requires_allowed')
  })

  it('keeps requires[] out of the extensions blob (it is a core field)', () => {
    const patch = manifestPatch(
      buildManifest({ requires: [{ id: 'theme-engine' }], engine: 'firestore' }),
      { repoBase: '', version: null },
    )
    expect(patch.requires).not.toBeNull()
    const ext = JSON.parse(patch.extensions ?? 'null')
    expect(ext).toEqual({ engine: 'firestore' })
  })
})
