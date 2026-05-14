import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { resolve } from 'node:path'
import { mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export const ConfigSchema = Type.Object({
  installed: Type.Boolean({ default: false }),
  database: Type.Optional(
    Type.Object({
      url: Type.String({ minLength: 1 }),
    }),
  ),
})

export type Config = Static<typeof ConfigSchema>

const CONFIG_PATH = process.env.CONFIG_PATH ?? resolve(process.cwd(), 'data/config.json')
const DEFAULT: Config = { installed: false }

let cached: Config | null = null

export function configPath(): string {
  return CONFIG_PATH
}

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(CONFIG_PATH)
  if (!(await file.exists())) {
    cached = { ...DEFAULT }
    return cached
  }
  const raw = await file.json()
  const merged = Value.Default(ConfigSchema, raw) as Config
  const errors = [...Value.Errors(ConfigSchema, merged)]
  if (errors.length > 0) {
    const summary = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')
    throw new Error(`Invalid ${CONFIG_PATH}:\n${summary}`)
  }
  cached = merged
  return cached
}

export function getConfig(): Config {
  if (!cached) throw new Error('config not loaded — call loadConfig() at boot')
  return cached
}

export async function saveConfig(next: Config): Promise<void> {
  const errors = [...Value.Errors(ConfigSchema, next)]
  if (errors.length > 0) {
    const summary = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')
    throw new Error(`Refusing to save invalid config:\n${summary}`)
  }
  await mkdir(dirname(CONFIG_PATH), { recursive: true })
  const tmp = `${CONFIG_PATH}.tmp`
  await Bun.write(tmp, JSON.stringify(next, null, 2) + '\n')
  await rename(tmp, CONFIG_PATH)
  cached = next
}

export function resetConfigCacheForTests(): void {
  cached = null
}
