<script lang="ts">
  import { Globe, RefreshCw, Code, Database, LayoutGrid, FileText } from '@lucide/svelte'
  import { fly } from 'svelte/transition'

  const features = [
    {
      icon: Globe,
      title: 'Provider-agnostic submission',
      body: 'OAuth flow across <strong>GitHub, GitLab, Gitea, and Forgejo</strong>. Plugin authors connect the git host they already use, pick a repo, done — Tabularium installs the release webhook for them.',
    },
    {
      icon: RefreshCw,
      title: 'Release-tracked versioning',
      body: 'Every git tag becomes a release row. <strong>Version, assets, min-runtime, manifest snapshot — captured automatically per release.</strong> Per-version downloads, per-platform asset matching, integrity hashes.',
    },
    {
      icon: Code,
      title: 'Typed catalog API',
      body: '<strong>Full OpenAPI spec, plus an Eden Treaty TypeScript client and an async Rust SDK</strong> (<code>tabularium-sdk</code> on crates.io). Build a plugin browser, an updater, an installer — fully type-checked end-to-end. Same API powers the built-in UI.',
    },
    {
      icon: Database,
      title: 'Your data, your dialect',
      body: '<strong>SQLite, Postgres, or MySQL.</strong> Auto-detected from the connection URL. Multi-dialect migrations bundled. Switch backends without forking the codebase.',
    },
    {
      icon: LayoutGrid,
      title: 'Configurable taxonomy',
      body: '<strong>Admin-defined plugin kinds</strong> — themes, snippets, SQL templates, whatever your ecosystem needs. End-user apps consume the kinds via the public API as filter chips. The registry adapts to your shape.',
    },
    {
      icon: FileText,
      title: 'White-label ready',
      body: '<strong>Brand it as your own.</strong> Custom name, colours, logo, favicon, analytics, robots policy, footer text. Configurable manifest filename so submissions look like yours, not ours.',
    },
  ]
</script>

<section id="features" class="bg-zinc-900 py-24 text-zinc-100">
  <div class="mx-auto max-w-6xl px-6">
    <div class="mx-auto max-w-2xl text-center">
      <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">A complete plugin registry</h2>
      <p class="mt-4 text-lg text-zinc-400">
        Everything you need to publish, version, and discover plugins — built like the registries
        you already trust, but running on your own infrastructure.
      </p>
    </div>
    <div class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each features as feature, i (feature.title)}
        <div
          class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 transition hover:-translate-y-0.5 hover:border-zinc-700"
          in:fly={{ y: 16, duration: 400, delay: i * 60 }}
        >
          <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <feature.icon class="h-5 w-5" />
          </div>
          <h3 class="text-lg font-semibold tracking-tight">{feature.title}</h3>
          <p class="mt-2 text-sm leading-relaxed text-zinc-400">{@html feature.body}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
