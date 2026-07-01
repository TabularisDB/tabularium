<script lang="ts">
  import { fly } from 'svelte/transition'
</script>

<section class="relative overflow-hidden bg-zinc-950 text-zinc-100">
  <div
    class="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.16),transparent_70%),radial-gradient(40%_35%_at_85%_20%,rgba(99,102,241,0.10),transparent_70%)]"
  ></div>
  <div class="relative mx-auto max-w-3xl px-6 py-28 text-center" in:fly={{ y: 24, duration: 500 }}>
    <span
      class="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-brand/10 px-4 py-1.5 text-sm font-medium text-brand"
    >
      <span class="h-1.5 w-1.5 rounded-full bg-brand"></span>
      Self-hosted plugin registry
    </span>
    <h1 class="text-5xl font-bold tracking-tight sm:text-6xl">
      The plugin registry<br /><span class="text-brand">you control</span>
    </h1>
    <p class="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
      The registry your ecosystem deserves. Bring your own git host. Ship releases automatically.
      Build any client on the typed API.
    </p>
    <p class="mx-auto mt-2 max-w-2xl text-base text-zinc-500">Self-host with one Docker command.</p>
    <div class="mt-10 flex flex-wrap justify-center gap-4">
      <a
        href="https://docs.tabularium.wiki/install/"
        class="rounded-lg bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark"
      >
        Get started &rarr;
      </a>
      <a
        href="https://github.com/TabularisDB/tabularium"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-200 transition hover:border-zinc-500"
      >
        View on GitHub
      </a>
    </div>
    <p class="mt-6 text-sm text-zinc-500">Apache 2.0 &middot; Self-hosted &middot; No vendor lock-in</p>
  </div>
</section>
