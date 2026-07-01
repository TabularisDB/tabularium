<script lang="ts">
  import { fade } from 'svelte/transition'
</script>

<section id="manifest" class="bg-zinc-950 py-24 text-zinc-100">
  <div class="mx-auto max-w-6xl px-6">
    <div class="mx-auto max-w-2xl text-center">
      <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">One manifest file per plugin</h2>
      <p class="mt-4 text-lg text-zinc-400">
        Drop a <code class="rounded bg-zinc-800 px-1.5 py-0.5 text-sm">.tabularium</code> at the repo
        root. Tabularium reads it on every release.
      </p>
    </div>
    <div class="mx-auto mt-14 max-w-2xl" in:fade={{ duration: 400 }}>
      <div class="overflow-hidden rounded-xl border border-zinc-700 shadow-[0_30px_60px_-30px_rgba(99,102,241,0.35)]">
        <div class="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-4 py-2.5">
          <div class="flex gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-white/20"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-white/20"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-white/20"></span>
          </div>
          <span class="font-mono text-xs tracking-wide text-zinc-400">.tabularium</span>
          <span class="w-8"></span>
        </div>
        <pre class="overflow-x-auto bg-zinc-950 px-6 py-6 font-mono text-sm leading-7"><span class="italic text-slate-500"># Plugin manifest — read on every release</span>
<span class="text-indigo-300">name</span><span class="text-slate-400">:</span> <span class="text-green-300">midnight-theme</span>
<span class="text-indigo-300">description</span><span class="text-slate-400">:</span> <span class="text-green-300">A calm, contrast-friendly dark theme.</span>
<span class="text-indigo-300">kind</span><span class="text-slate-400">:</span> <span class="text-green-300">theme</span>
<span class="text-indigo-300">license</span><span class="text-slate-400">:</span> <span class="text-green-300">MIT</span>
<span class="text-indigo-300">homepage</span><span class="text-slate-400">:</span> <span class="text-green-300">https://example.com/midnight</span>

<span class="text-indigo-300">tags</span><span class="text-slate-400">:</span>
  <span class="text-slate-400">-</span> <span class="text-green-300">dark</span>
  <span class="text-slate-400">-</span> <span class="text-green-300">minimal</span>

<span class="text-indigo-300">icon</span><span class="text-slate-400">:</span> <span class="text-green-300">./assets/icon.svg</span>
<span class="text-indigo-300">screenshots</span><span class="text-slate-400">:</span>
  <span class="text-slate-400">-</span> <span class="text-indigo-300">url</span><span class="text-slate-400">:</span> <span class="text-green-300">./assets/preview.png</span>
    <span class="text-indigo-300">caption</span><span class="text-slate-400">:</span> <span class="text-green-300">Editor view</span>

<span class="text-indigo-300">min_runtime_version</span><span class="text-slate-400">:</span> <span class="text-green-300">'2.0.0'</span></pre>
      </div>
    </div>
  </div>
</section>
