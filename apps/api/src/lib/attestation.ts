import { logger } from './logger'

const log = logger.child({ module: 'attestation' })

export type FetchAttestationArgs = {
  apiBase: string
  owner: string
  repo: string
  sha256: string
  token: string
}

// GET <apiBase>/repos/<owner>/<repo>/attestations/sha256:<sha256>
// Returns the verbatim sigstore envelope, null on 404, throws on other failure.
export async function fetchAttestation(args: FetchAttestationArgs): Promise<unknown | null> {
  const { apiBase, owner, repo, sha256, token } = args
  const url = `${apiBase}/repos/${owner}/${repo}/attestations/sha256:${sha256}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'tabularium/1.0',
    },
  })
  if (res.status === 200) {
    return await res.json()
  }
  if (res.status === 404) {
    return null
  }
  const excerpt = (await res.text().catch(() => '')).slice(0, 200)
  log.warn({ url, status: res.status, excerpt }, 'attestation fetch failed')
  throw new Error(`attestation fetch failed: HTTP ${res.status}: ${excerpt}`)
}
