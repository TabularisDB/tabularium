#!/usr/bin/env bun
// Render the dev cluster's Secret + envFrom-consuming Deployments.
//
// Layers .env.example + .env from repo root + apps/api + apps/frontend, then
// overrides DB/Redis URLs to the in-cluster services. Tilt pipes the output
// into `k8s_yaml(...)` so changes to any .env file trigger an automatic apply.
//
// We also stamp a `checksum/env` annotation onto the api/frontend/migrate
// pod templates so K8s does a rolling restart when the Secret content
// changes (envFrom alone wouldn't trigger one).

import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { parseAllDocuments, stringify as yamlStringify } from 'yaml'

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
// Hardcoded in the dev cluster regardless of any local .env override —
// you wanted a fixed dev login. Production uses the Helm chart, which
// never sees this script, so the hardcoding is contained to the Tilt path.
env.BOOTSTRAP_PASSWORD = 'tabularium-dev'

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

// Hash of the rendered Secret content. Used as the pod-template annotation
// below — when env values change, the hash changes, the Deployment's pod
// template changes, and K8s does a rolling restart on its own.
const envChecksum = createHash('sha256').update(result.stdout).digest('hex').slice(0, 12)

// Manifests that consume the Secret via envFrom and should re-roll when
// it changes. Postgres/Dragonfly are skipped — they have PVCs and rarely
// need restarts on app-level env churn.
const envConsumingManifests = ['deploy/dev/api.yaml', 'deploy/dev/frontend.yaml', 'deploy/dev/db-migrate-job.yaml']

type PodTemplateHolder = {
  spec?: {
    template?: {
      metadata?: { annotations?: Record<string, string> }
    }
  }
}

function stampChecksum(rawYaml: string): string {
  const docs = parseAllDocuments(rawYaml)
  const out: string[] = []
  for (const doc of docs) {
    const obj = doc.toJSON() as PodTemplateHolder & { kind?: string }
    if (obj?.kind === 'Deployment' || obj?.kind === 'Job') {
      const tmpl = (obj.spec ??= {}).template ??= {}
      const meta = (tmpl.metadata ??= {})
      const annotations = (meta.annotations ??= {})
      annotations['checksum/env'] = envChecksum
    }
    out.push(yamlStringify(obj))
  }
  return out.join('---\n')
}

process.stdout.write(result.stdout)
for (const path of envConsumingManifests) {
  const full = join(rootDir, path)
  if (!existsSync(full)) continue
  process.stdout.write('\n---\n')
  process.stdout.write(stampChecksum(readFileSync(full, 'utf8')))
}
