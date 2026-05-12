// src/lib/providers.ts

type OwnershipResult =
  | { owned: true }
  | { owned: false; reason: string }

export async function checkGithubOwnership(
  accessToken: string,
  repoUrl: string,
  username: string,
): Promise<OwnershipResult> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/)
  if (!match) return { owned: false, reason: 'Invalid GitHub repo URL' }
  const [, owner, repo] = match

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'tabularis-registry/1.0',
      Accept: 'application/vnd.github+json',
    },
  })

  if (res.status === 404) return { owned: false, reason: 'Repo not found' }
  if (!res.ok) return { owned: false, reason: `GitHub API error: ${res.status}` }

  const data = await res.json() as { owner?: { login?: string } }
  const repoOwner = data.owner?.login?.toLowerCase()
  if (repoOwner !== username.toLowerCase()) {
    return { owned: false, reason: 'Repo does not belong to authenticated user' }
  }
  return { owned: true }
}

export async function checkGiteaOwnership(
  instanceUrl: string,
  accessToken: string,
  repoUrl: string,
  username: string,
): Promise<OwnershipResult> {
  const base = instanceUrl.replace(/\/$/, '')
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = repoUrl.match(new RegExp(`${escapedBase}/([^/]+)/([^/]+?)(\\.git)?$`))
  if (!match) return { owned: false, reason: 'Invalid Gitea repo URL for this instance' }
  const [, owner, repo] = match

  const res = await fetch(`${base}/api/v1/repos/${owner}/${repo}`, {
    headers: { Authorization: `token ${accessToken}` },
  })

  if (res.status === 404) return { owned: false, reason: 'Repo not found' }
  if (!res.ok) return { owned: false, reason: `Gitea API error: ${res.status}` }

  const data = await res.json() as { owner?: { login?: string } }
  const repoOwner = data.owner?.login?.toLowerCase()
  if (repoOwner !== username.toLowerCase()) {
    return { owned: false, reason: 'Repo does not belong to authenticated user' }
  }
  return { owned: true }
}
