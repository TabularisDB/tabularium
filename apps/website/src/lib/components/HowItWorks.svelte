<script lang="ts">
  import { fly } from 'svelte/transition'

  const steps = [
    {
      title: 'Self-host',
      body: 'One Bun process, one database URL. The install wizard runs migrations and prints a bootstrap admin password on first boot.',
    },
    {
      title: 'Connect providers',
      body: 'Register OAuth apps on the git hosts you accept — GitHub, GitLab, Gitea, Forgejo. Paste the credentials into the admin UI.',
    },
    {
      title: 'Authors submit',
      body: 'Plugin authors sign in with their git account, pick a repo, and Tabularium installs the release webhook. New tags become new versions.',
    },
  ]
</script>

<section id="how" class="bg-zinc-900 py-24 text-zinc-100">
  <div class="mx-auto max-w-6xl px-6">
    <div class="mx-auto max-w-2xl text-center">
      <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
      <p class="mt-4 text-lg text-zinc-400">
        Three steps from empty server to a running registry your community can publish to.
      </p>
    </div>
    <div class="mt-14 grid gap-6 sm:grid-cols-3">
      {#each steps as step, i (step.title)}
        <div
          class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6"
          in:fly={{ y: 16, duration: 400, delay: i * 80 }}
        >
          <span
            class="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
          >
            {i + 1}
          </span>
          <h3 class="text-lg font-semibold tracking-tight">{step.title}</h3>
          <p class="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
