<script lang="ts">
	import { onMount } from 'svelte'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import { api } from '$lib/api'
	import { branding } from '$lib/stores/branding.svelte'
	import type { PageSummary } from '$lib/types'

	let footerPages = $state<PageSummary[]>([])

	onMount(async () => {
		try {
			const data = await api.get<{ pages: PageSummary[] }>('/api/pages')
			footerPages = data.pages.filter((p) => p.showInFooter)
		} catch {
			footerPages = []
		}
	})
</script>

<footer class="border-t border-border mt-24">
	<div class="mx-auto max-w-6xl px-6 py-10 grid gap-6 sm:grid-cols-3 text-sm">
		<div class="space-y-2">
			<div class="font-semibold text-foreground">{branding.name}</div>
			<p class="text-muted-foreground">
				{branding.footerText ?? branding.tagline}
			</p>
		</div>
		<div class="space-y-2">
			<div class="font-medium text-foreground">Developers</div>
			<div class="flex flex-col gap-1.5 text-muted-foreground">
				<a href="/openapi" class="hover:text-foreground inline-flex items-center gap-1.5">
					OpenAPI <ExternalLink class="h-3 w-3" />
				</a>
				<a href="/api/manifest" class="hover:text-foreground inline-flex items-center gap-1.5">
					.pluggr spec <ExternalLink class="h-3 w-3" />
				</a>
				<a href="/openapi/json" class="hover:text-foreground inline-flex items-center gap-1.5">
					Spec JSON <ExternalLink class="h-3 w-3" />
				</a>
			</div>
		</div>
		<div class="space-y-2">
			<div class="font-medium text-foreground">Resources</div>
			<div class="flex flex-col gap-1.5 text-muted-foreground">
				<a href="/" class="hover:text-foreground">Home</a>
				<a href="/plugins" class="hover:text-foreground">Plugins</a>
				<a href="/requests" class="hover:text-foreground">Requests</a>
				{#each footerPages as p (p.slug)}
					<a href={p.path} class="hover:text-foreground">{p.title}</a>
				{/each}
			</div>
		</div>
	</div>
</footer>
