<script lang="ts">
	import { onMount } from 'svelte'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import { eden } from '$lib/eden'
	import { branding } from '$lib/stores/branding.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'
	import type { PageSummary } from '$lib/types'

	let footerPages = $state<PageSummary[]>([])

	async function load(locale: string) {
		try {
			const { data, error } = await eden.api.pages.get({ query: { locale } })
			if (error) throw error
			const payload = data as { pages: PageSummary[] }
			footerPages = payload.pages.filter((p) => p.showInFooter)
		} catch {
			footerPages = []
		}
	}

	onMount(() => load(i18n.current))

	$effect(() => {
		void i18n.current
		load(i18n.current)
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
			<div class="font-medium text-foreground">{m.footer_developers()}</div>
			<div class="flex flex-col gap-1.5 text-muted-foreground">
				<a href="/openapi" class="hover:text-foreground inline-flex items-center gap-1.5">
					{m.footer_openapi()} <ExternalLink class="h-3 w-3" />
				</a>
				<a href="/api/manifest" class="hover:text-foreground inline-flex items-center gap-1.5">
					{m.footer_spec()} <ExternalLink class="h-3 w-3" />
				</a>
				<a href="/openapi/json" class="hover:text-foreground inline-flex items-center gap-1.5">
					{m.footer_spec_json()} <ExternalLink class="h-3 w-3" />
				</a>
			</div>
		</div>
		<div class="space-y-2">
			<div class="font-medium text-foreground">{m.footer_resources()}</div>
			<div class="flex flex-col gap-1.5 text-muted-foreground">
				<a href="/" class="hover:text-foreground">{m.footer_home()}</a>
				<a href="/plugins" class="hover:text-foreground">{m.nav_plugins()}</a>
				<a href="/requests" class="hover:text-foreground">{m.nav_requests()}</a>
				{#each footerPages as p (p.slug)}
					<a href={p.path} class="hover:text-foreground">{p.title}</a>
				{/each}
			</div>
		</div>
	</div>
</footer>
