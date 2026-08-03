import { getSetting } from './settings'

/** Collapse a burst of admin edits into a single downstream rebuild. */
const DEBOUNCE_MS = 15_000

let timer: ReturnType<typeof setTimeout> | null = null
let pendingReason = ''

/**
 * POST the configured deploy hook (setting `docs.deploy_hook_url`) after a
 * docs-affecting admin mutation, so static consumers of the live docs (e.g.
 * the website mirroring /api/docs/plugin-development at build time) rebuild
 * without waiting for their cron. Fire-and-forget; no-op when unset.
 */
export function triggerDeployHook(reason: string, debounceMs: number = DEBOUNCE_MS): void {
  const url = getSetting('docs.deploy_hook_url')
  if (!url) return
  pendingReason = reason
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const r = pendingReason
    fetch(url, { method: 'POST' }).catch((err) => {
      console.error(`deploy hook POST failed (${r}):`, err)
    })
  }, debounceMs)
}
