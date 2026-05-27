#!/usr/bin/env bun
// Render a kubernetes Secret yaml for the dev cluster.
//
// Layers .env.example + .env from repo root + apps/api + apps/frontend, then
// overrides DB/Redis URLs to the in-cluster services. Tilt pipes the output
// into `k8s_yaml(...)` so changes to any .env file trigger an automatic apply.
//
// Output is on stdout; kubectl is invoked with --dry-run=client.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const rootDir = join(import.meta.dir, '..')

const envFiles = [
  join(rootDir, '.env.example'),
  join(rootDir, '.env'),
  join(rootDir, 'apps/api/.env.example'),
  join(rootDir, 'apps/api/.env'),
  join(rootDir, 'apps/frontend/.env.example'),
  join(rootDir, 'apps/frontend/.env'),
]

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    value = value.replaceAll('\\n', '\n')
    env[key] = value
  }

  return env
}

function loadEnvFiles(): Record<string, string> {
  const env: Record<string, string> = {}

  for (const file of envFiles) {
    if (!existsSync(file)) continue
    Object.assign(env, parseEnvFile(readFileSync(file, 'utf8')))
  }

  return env
}

function toEnvFileLine(key: string, value: string): string {
  if (/[\n\r"#\\]/.test(value)) {
    return `${key}=${JSON.stringify(value)}`
  }

  return `${key}=${value}`
}

const env = loadEnvFiles()

env.NODE_ENV ??= 'development'
env.LOG_LEVEL ??= 'debug'
env.PORT ??= '3000'

// Port-forwarded URLs as seen from the host (browser).
env.BASE_URL ??= 'http://localhost:3000'
env.WEB_BASE_URL ??= 'http://localhost:5180'

// In-cluster service URLs override whatever's in .env files.
env.DATABASE_URL = 'postgres://tabularium:tabularium@postgres:5432/tabularium'
env.CACHE_DRIVER = 'redis'
env.REDIS_URL = 'redis://dragonfly:6379'

// Frontend proxy target — vite.config.ts reads this and points /api at it.
env.API_PROXY_TARGET = 'http://tabularium-api:3000'

env.POSTGRES_USER = 'tabularium'
env.POSTGRES_PASSWORD = 'tabularium'
env.POSTGRES_DB = 'tabularium'

// Bootstrap secrets — dev only, rotate before any non-dev use.
env.JWT_SECRET ||= 'dev-jwt-secret-please-rotate-in-non-dev-environments-32b'
env.TOKEN_ENC_KEY ||= 'a'.repeat(64)

const tempDir = mkdtempSync(join(tmpdir(), 'tabularium-k8s-env-'))
const envFilePath = join(tempDir, 'tabularium.env')
writeFileSync(
  envFilePath,
  Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => toEnvFileLine(key, value))
    .join('\n'),
)

const result = spawnSync(
  'kubectl',
  [
    'create',
    'secret',
    'generic',
    'tabularium-env',
    '--namespace=tabularium-dev',
    `--from-env-file=${envFilePath}`,
    '--dry-run=client',
    '-o',
    'yaml',
  ],
  { encoding: 'utf8' },
)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}

process.stdout.write(result.stdout)
