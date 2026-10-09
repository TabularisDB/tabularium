<script lang="ts">
	import { onMount } from 'svelte'
	import Check from '@lucide/svelte/icons/check'
	import Terminal from '@lucide/svelte/icons/terminal'
	import Button from '$components/ui/Button.svelte'
	import CodeBlock from '$components/ui/CodeBlock.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'
	import type { PluginListResponse } from '$lib/types'

	// Placeholder shown until (or instead of) a real catalogue entry.
	const FALLBACK = { id: 'awesome', name: 'Awesome Plugin', latestVersion: '1.2.0', downloads: 0 }

	let origin = $state('')
	let response = $state<{ total: number; plugins: Array<Record<string, unknown>> }>({ total: 1, plugins: [FALLBACK] })

	const curlSnippet = $derived(`$ curl -s ${origin}/api/plugins?limit=1`)
	const responseSnippet = $derived(JSON.stringify(response, null, 2))

	onMount(async () => {
		origin = window.location.origin
		try {
			const { data, error } = await eden.api.plugins.get({ query: { limit: '1' } })
			if (error) throw error
			const res = data as PluginListResponse
			const p = res.plugins[0]
			if (p) {
				response = {
					total: res.total,
					plugins: [{ id: p.id, name: p.name, latestVersion: p.latestVersion, downloads: p.downloads }],
				}
			}
		} catch {
			// keep the placeholder
		}
	})
</script>

<section
	class="dev-box relative isolate grid grid-cols-[minmax(0,1fr)] gap-10 overflow-hidden rounded-xl border border-border p-6 sm:p-10 lg:grid-cols-2 lg:items-center tabularis:rounded-lg tabularis:border-[0.1rem]"
>
	<div class="space-y-4">
		<div class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
			<Terminal class="h-3.5 w-3.5" />
			{m.home_dev_eyebrow()}
		</div>
		<h2 class="text-2xl font-semibold tracking-tight">{m.home_dev_title()}</h2>
		<p class="text-muted-foreground">{m.home_dev_body()}</p>
		<ul class="space-y-2 text-sm">
			{#each [m.home_dev_point_rest(), m.home_dev_point_schema(), m.home_dev_point_mcp()] as point (point)}
				<li class="flex items-start gap-2">
					<Check class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
					<span>{point}</span>
				</li>
			{/each}
		</ul>
	</div>
	<div class="min-w-0 space-y-2">
		<CodeBlock value={curlSnippet} />
		<CodeBlock value={responseSnippet} class="max-h-72 overflow-auto" />
	</div>
</section>

<style>
	/* Highlighted box: a soft accent glow over a faded dot grid (tabularis.dev bounty teaser). */
	.dev-box {
		background:
			radial-gradient(
				ellipse 60% 80% at 0% 0%,
				color-mix(in srgb, var(--color-brand-accent) 10%, transparent),
				transparent 70%
			),
			radial-gradient(
				ellipse 50% 70% at 100% 100%,
				color-mix(in srgb, var(--color-primary) 8%, transparent),
				transparent 70%
			),
			color-mix(in srgb, var(--color-card) 55%, var(--color-background));
	}
	.dev-box::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
		background-size: 16px 16px;
		mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
		pointer-events: none;
	}
</style>
