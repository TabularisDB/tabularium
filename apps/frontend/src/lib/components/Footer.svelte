<script lang="ts">
	import { onMount } from 'svelte'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import { eden } from '$lib/eden'
	import { branding } from '$lib/stores/branding.svelte'
	import { features } from '$lib/stores/features.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'
	import type { PageSummary } from '$lib/types'

	let footerPages = $state<PageSummary[]>([])
	const year = new Date().getFullYear()

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

	const resourceLinks = $derived([
		{ href: '/', label: m.footer_home(), show: true },
		{ href: '/plugins', label: m.nav_plugins(), show: true },
		{ href: '/requests', label: m.nav_requests(), show: features.requestsEnabled },
		{ href: '/submit', label: m.nav_submit(), show: features.submissionsEnabled },
	].filter((l) => l.show))
</script>

<footer class="border-t border-border mt-32 bg-card/20">
	<div class="mx-auto max-w-6xl px-6 pt-16 pb-10 grid gap-16 lg:grid-cols-2 text-sm">
		<div class="space-y-4 max-w-md">
			<a href="/" class="inline-flex items-center gap-3 font-semibold tracking-tight">
				{#if branding.logoUrl}
					<img src={branding.logoUrl} alt={branding.name} class="h-10 w-10 rounded-md object-contain" />
				{:else}
					<span class="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
						<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="4" y="4" width="14" height="3" rx="0.5" />
							<rect x="5" y="10.5" width="14" height="3" rx="0.5" />
							<rect x="6" y="17" width="14" height="3" rx="0.5" />
						</svg>
					</span>
				{/if}
				<span class="text-base">{branding.name}</span>
			</a>
			<p class="text-muted-foreground leading-relaxed">
				{branding.footerText ?? branding.tagline}
			</p>
		</div>

		<div class="grid grid-cols-2 gap-12">
			<div class="space-y-4">
				<div class="font-medium text-foreground text-xs uppercase tracking-wider">{m.footer_resources()}</div>
				<div class="flex flex-col gap-2.5 text-muted-foreground">
					{#each resourceLinks as link (link.href)}
						<a href={link.href} class="hover:text-foreground transition-colors w-fit">{link.label}</a>
					{/each}
					{#each footerPages as p (p.slug)}
						<a href={p.path} class="hover:text-foreground transition-colors w-fit">{p.title}</a>
					{/each}
				</div>
			</div>

			<div class="space-y-4">
				<div class="font-medium text-foreground text-xs uppercase tracking-wider">{m.footer_developers()}</div>
				<div class="flex flex-col gap-2.5 text-muted-foreground">
					<a href="/openapi" class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors w-fit">
						{m.footer_openapi()} <ExternalLink class="h-3 w-3" />
					</a>
					<a href="/api/manifest" class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors w-fit">
						{m.footer_spec()} <ExternalLink class="h-3 w-3" />
					</a>
					<a href="/openapi/json" class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors w-fit">
						{m.footer_spec_json()} <ExternalLink class="h-3 w-3" />
					</a>
				</div>
			</div>
		</div>
	</div>

	<div class="border-t border-border/60">
		<div class="mx-auto max-w-6xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/70">
			<span>© {year} {branding.name}</span>
			<a href="https://tabularium.wiki" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
				<span>Powered by</span>
				<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="4" y="4" width="14" height="3" rx="0.5" />
					<rect x="5" y="10.5" width="14" height="3" rx="0.5" />
					<rect x="6" y="17" width="14" height="3" rx="0.5" />
				</svg>
				<span class="font-medium">Tabularium</span>
			</a>
		</div>
	</div>
</footer>
