export function deriveSlug(repoName: string): string {
  return repoName
    .toLowerCase()
    .replace(/^tabularis-/, '')
    .replace(/-plugin$/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
