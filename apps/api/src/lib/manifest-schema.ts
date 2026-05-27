import type { TSchema } from '@sinclair/typebox'
import { getManifestConfig } from './manifest-config'
import { getSetting, setSetting, deleteSetting, hasSetting } from './settings'
import { buildSchema, ManifestSchema, type ExtensionsDelta } from '@tabularium/manifest'
import { validateExtensionsDelta } from './extensions-schema'
import { getKind, getKinds } from './kinds'

const SETTING_KEY = 'manifest.extensions_schema'

export type { ExtensionsDelta, JsonSchemaProperty } from './extensions-schema'
export { validateExtensionsDelta } from './extensions-schema'

export function getExtensionsDelta(): ExtensionsDelta {
  const raw = getSetting(SETTING_KEY)
  if (!raw) return {}
  try {
    return validateExtensionsDelta(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

export async function setExtensionsDelta(delta: ExtensionsDelta | null): Promise<void> {
  if (delta === null || Object.keys(delta).length === 0) {
    if (hasSetting(SETTING_KEY)) await deleteSetting(SETTING_KEY)
    return
  }
  await setSetting(SETTING_KEY, JSON.stringify(validateExtensionsDelta(delta)))
}

export function getEffectiveExtensions(kindKey?: string | null): ExtensionsDelta {
  if (kindKey) {
    const kind = getKind(kindKey)
    if (kind && kind.extensionsSchema && Object.keys(kind.extensionsSchema).length > 0) {
      return kind.extensionsSchema
    }
  }
  return getExtensionsDelta()
}

function loadKindOverrides(): Record<string, ExtensionsDelta> {
  const out: Record<string, ExtensionsDelta> = {}
  for (const k of getKinds()) {
    if (k.extensionsSchema && Object.keys(k.extensionsSchema).length > 0) {
      out[k.key] = k.extensionsSchema
    }
  }
  return out
}

export function buildMergedSchema(options: { kind?: string | null } = {}): Record<string, unknown> {
  const cfg = getManifestConfig()
  return buildSchema({
    coreSchema: ManifestSchema as unknown as TSchema,
    extensions: getExtensionsDelta(),
    kindOverrides: loadKindOverrides(),
    kind: options.kind ?? null,
    schemaUrl: cfg.schemaUrl,
  })
}
