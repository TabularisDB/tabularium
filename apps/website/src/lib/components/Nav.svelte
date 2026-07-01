<script lang="ts">
  import GitHubStars from './GitHubStars.svelte'
</script>

<header class="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/75 backdrop-blur">
  <div class="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-6">
    <a href="/" class="flex items-center gap-2" aria-label="Tabularium home">
      <img src="/assets/wordmark.svg" alt="Tabularium" class="h-8 w-auto" />
    </a>
    <nav class="flex items-center gap-1 text-sm" aria-label="Primary">
      <a
        href="#features"
        class="hidden rounded-md px-3 py-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 sm:block"
      >
        Features
      </a>
      <a
        href="#manifest"
        class="hidden rounded-md px-3 py-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 sm:block"
      >
        Manifest
      </a>
      <a
        href="#how"
        class="hidden rounded-md px-3 py-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 sm:block"
      >
        How it works
      </a>
      <a
        href="https://docs.tabularium.wiki/"
        class="hidden rounded-md px-3 py-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 sm:block"
      >
        Docs
      </a>
      <GitHubStars />
      <a
        href="https://docs.tabularium.wiki/install/"
        class="ml-1 rounded-lg bg-brand px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
      >
        Get started
      </a>
    </nav>
  </div>
</header>
