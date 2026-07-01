<script lang="ts">
  import { fade } from 'svelte/transition'
</script>

<section class="relative overflow-hidden border-t border-zinc-800 bg-zinc-950 py-28 text-center text-zinc-100">
  <div
    class="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_50%,rgba(99,102,241,0.14),transparent_70%)]"
  ></div>
  <div class="relative mx-auto max-w-xl px-6" in:fade={{ duration: 500 }}>
    <h2 class="text-4xl font-bold tracking-tight">Stop curating plugin lists by hand.</h2>
    <p class="mt-4 text-lg text-zinc-400">
      Self-host Tabularium with one Docker command. Authors push a tag — your catalog stays
      current.
    </p>
    <a
      href="https://docs.tabularium.wiki/install/"
      class="mt-8 inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark"
    >
      Read the install guide &rarr;
    </a>
  </div>
</section>
