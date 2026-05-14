import { logger } from './logger'
import type { RepoRef } from './providers'

const log = logger.child({ module: 'setup-webhook' })

export type WebhookSetupResult =
  | { installed: true; hookId: number }
  | { installed: false; reason: string }

async function setupGithubFlavored(
  apiBase: string,
  accessToken: string,
  ref: RepoRef,
  webhookUrl: string,
  secret: string,
  kind: 'github' | 'gitea',
): Promise<WebhookSetupResult> {
  const url = `${apiBase}/repos/${ref.owner}/${ref.repo}/hooks`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  if (kind === 'github') headers['User-Agent'] = 'tabularium/1.0'

  const body = kind === 'github'
    ? { name: 'web', active: true, events: ['release'], config: { url: webhookUrl, content_type: 'json', secret, insecure_ssl: '0' } }
    : { type: 'gitea', active: true, events: ['release'], config: { url: webhookUrl, content_type: 'json', secret } }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (res.status === 201) {
    const data = (await res.json()) as { id: number }
    log.info({ repo: ref.fullName, hookId: data.id, kind }, 'webhook installed')
    return { installed: true, hookId: data.id }
  }
  log.warn({ repo: ref.fullName, status: res.status, kind }, 'webhook setup failed')
  return { installed: false, reason: `Provider returned ${res.status}` }
}

async function setupGitlab(
  baseUrl: string,
  accessToken: string,
  ref: RepoRef,
  webhookUrl: string,
  secret: string,
): Promise<WebhookSetupResult> {
  const projectId = encodeURIComponent(ref.fullName)
  const res = await fetch(`${baseUrl}/api/v4/projects/${projectId}/hooks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      token: secret,
      releases_events: true,
      enable_ssl_verification: true,
    }),
  })
  if (res.status === 201) {
    const data = (await res.json()) as { id: number }
    log.info({ repo: ref.fullName, hookId: data.id }, 'gitlab webhook installed')
    return { installed: true, hookId: data.id }
  }
  log.warn({ repo: ref.fullName, status: res.status }, 'gitlab webhook setup failed')
  return { installed: false, reason: `GitLab returned ${res.status}` }
}

export async function setupWebhook(
  accessToken: string,
  ref: RepoRef,
  webhookUrl: string,
  secret: string,
): Promise<WebhookSetupResult> {
  const { instance } = ref
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com'
      ? 'https://api.github.com'
      : `${instance.baseUrl}/api/v3`
    return setupGithubFlavored(apiBase, accessToken, ref, webhookUrl, secret, 'github')
  }
  if (instance.kind === 'gitea') {
    return setupGithubFlavored(`${instance.baseUrl}/api/v1`, accessToken, ref, webhookUrl, secret, 'gitea')
  }
  return setupGitlab(instance.baseUrl, accessToken, ref, webhookUrl, secret)
}
