<script lang="ts">
  import { onMount } from 'svelte'
  import Star from '@lucide/svelte/icons/star'

  const repo = 'TabularisDB/tabularium'
  let stars = $state<number | null>(null)

  function format(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
  }

  // Live count: fetched client-side on hydration. The page is prerendered, so
  // it ships without a count and fills in once mounted. Unauthenticated GitHub
  // API is rate-limited (60/h/IP) — on failure we just show the button
  // without a number, still linking to the repo.
  onMount(async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}`)
      if (res.ok) stars = (await res.json()).stargazers_count ?? null
    } catch {
      // ignore — keep the button, drop the count
    }
  })
</script>

<a
  href="https://github.com/{repo}"
  target="_blank"
  rel="noopener noreferrer"
  class="flex items-center gap-1.5 rounded-md px-3 py-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
  aria-label="Star Tabularium on GitHub"
>
  <Star class="h-4 w-4" />
  <span class="hidden sm:inline">Star</span>
  {#if stars !== null}
    <span
      class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-300"
    >
      {format(stars)}
    </span>
  {/if}
</a>
