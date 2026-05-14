import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

const EnvSchema = Type.Object({
  DATABASE_URL: Type.Optional(Type.String({ minLength: 1 })),
  JWT_SECRET: Type.String({
    minLength: 32,
    pattern: '^(?!change-me-in-production$).+$',
    description: 'Min 32 chars, must not be the placeholder string.',
  }),
  TOKEN_ENC_KEY: Type.String({
    pattern: '^[0-9a-fA-F]{64}$',
    description: '64 hex chars (32 bytes) for AES-256-GCM at-rest encryption.',
  }),
  BASE_URL: Type.String({ pattern: '^https?://.+' }),
  WEB_BASE_URL: Type.Optional(Type.String({ pattern: '^https?://.+' })),
  ALLOWED_ORIGINS: Type.Optional(Type.String()),
  PORT: Type.Optional(Type.String()),
  NODE_ENV: Type.Optional(Type.Union([Type.Literal('development'), Type.Literal('production'), Type.Literal('test')])),
  LOG_LEVEL: Type.Optional(Type.String()),

  CACHE_DRIVER: Type.Union(
    [Type.Literal('off'), Type.Literal('memory'), Type.Literal('redis')],
    { default: 'memory' },
  ),
  REDIS_URL: Type.Optional(Type.String({ pattern: '^rediss?://.+' })),

  // Optional bootstrap-seed: if set, provider_instances will be seeded on first boot.
  // Once admins configure providers via the UI, these are ignored.
  GITHUB_CLIENT_ID: Type.Optional(Type.String()),
  GITHUB_CLIENT_SECRET: Type.Optional(Type.String()),
  GITLAB_CLIENT_ID: Type.Optional(Type.String()),
  GITLAB_CLIENT_SECRET: Type.Optional(Type.String()),
  CODEBERG_CLIENT_ID: Type.Optional(Type.String()),
  CODEBERG_CLIENT_SECRET: Type.Optional(Type.String()),
})

export type Env = Static<typeof EnvSchema>

function loadEnv(): Env {
  const raw: Record<string, string | undefined> = {}
  for (const key of Object.keys(EnvSchema.properties)) {
    raw[key] = Bun.env[key]
  }
  const cleaned = Value.Default(EnvSchema, raw)
  const errors = [...Value.Errors(EnvSchema, cleaned)]
  if (errors.length > 0) {
    const summary = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')
    throw new Error(`Invalid environment:\n${summary}`)
  }
  return cleaned as Env
}

export const env: Env = loadEnv()

export function isProd(): boolean {
  return env.NODE_ENV === 'production'
}

export function allowedOrigins(): string[] {
  const fromList = env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  const fromWeb = env.WEB_BASE_URL ? [env.WEB_BASE_URL] : []
  const fromBase = [env.BASE_URL]
  const dev = isProd() ? [] : ['http://localhost:5180', 'http://127.0.0.1:5180']
  return [...new Set([...fromList, ...fromWeb, ...fromBase, ...dev])]
}
