<script lang="ts">
	import { onMount } from 'svelte'
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Cable from '@lucide/svelte/icons/cable'
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import Star from '@lucide/svelte/icons/star'
	import Button from '$components/ui/Button.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import PluginCard from '$components/PluginCard.svelte'
	import CmsPage from '$components/CmsPage.svelte'
	import { eden } from '$lib/eden'
	import { branding } from '$lib/stores/branding.svelte'
	import { homeCopy } from '$lib/stores/home-copy.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'
	import type { Plugin, PluginListResponse, PageRendered } from '$lib/types'

	let customHomepage = $state<PageRendered | null>(null)
	let homepageChecked = $state(false)

	let featured = $state<Plugin[] | null>(null)
	let recent = $state<Plugin[] | null>(null)
	let total = $state(0)
	let loading = $state(true)

	onMount(async () => {
		try {
			const { data, error } = await eden.api.pages['by-path'].get({ query: { path: '/', locale: i18n.current } })
			if (error) throw error
			customHomepage = data as PageRendered
			homepageChecked = true
			return
		} catch {
			// no custom homepage — fall through to default
		}
		homepageChecked = true
		try {
			const [featRes, recRes] = await Promise.all([
				eden.api.plugins.get({ query: { featured: '1', sort: 'featured', limit: '6' } }),
				eden.api.plugins.get({ query: { sort: 'new', limit: '6' } }),
			])
			if (featRes.error) throw featRes.error
			if (recRes.error) throw recRes.error
			const feat = featRes.data as PluginListResponse
			const rec = recRes.data as PluginListResponse
			featured = feat.plugins
			recent = rec.plugins
			total = rec.total
		} catch {
			featured = []
			recent = []
		} finally {
			loading = false
		}
	})
</script>

<svelte:head>
	{#if customHomepage}<title>{customHomepage.title}</title>{/if}
</svelte:head>

{#if !homepageChecked}
	<div class="mx-auto max-w-4xl px-6 py-24 space-y-4">
		<Skeleton class="h-12 w-1/2 rounded-md" />
		<Skeleton class="h-32 w-full rounded-md" />
	</div>
{:else if customHomepage}
	<div class="mx-auto max-w-4xl px-6 py-12 space-y-6">
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">{customHomepage.title}</h1>
		</header>
		<CmsPage html={customHomepage.html} />
	</div>
{:else}
	<section class="hero-grid border-b border-border">
		<div class="mx-auto max-w-6xl px-6 py-24 sm:py-32 text-center">
			{#if homeCopy.eyebrow.enabled}
				<div class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-8">
					<Sparkles class="h-3 w-3 text-primary" />
					{homeCopy.pick(homeCopy.eyebrow.text, i18n.current) ?? m.home_eyebrow()}
				</div>
			{/if}
			<h1 class="text-4xl sm:text-6xl font-semibold tracking-tight text-foreground">
				{branding.name}<span class="text-primary">.</span>
			</h1>
			<p class="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
				{branding.tagline}
			</p>
			<div class="mt-10 flex items-center justify-center gap-3 flex-wrap">
				<Button size="lg" href="/plugins">
					{m.home_browse_plugins()}
					<ArrowRight class="h-4 w-4" />
				</Button>
				<Button size="lg" variant="outline" href="/submit">{m.home_submit_plugin()}</Button>
			</div>
			{#if total > 0}
				<p class="mt-6 text-xs text-muted-foreground">
					{m.home_plugins_indexed({ count: total })}
				</p>
			{/if}
		</div>
	</section>

	{#if featured && featured.length > 0}
		<section class="border-b border-border bg-card/30">
			<div class="mx-auto max-w-6xl px-6 py-12 space-y-6">
				<div class="flex items-baseline justify-between">
					<div class="space-y-1">
						<div class="inline-flex items-center gap-2 text-xs text-primary uppercase tracking-wider">
							<Star class="h-3 w-3 fill-current" />
							{m.home_featured_eyebrow()}
						</div>
						<h2 class="text-2xl font-semibold tracking-tight">{m.home_featured_title()}</h2>
					</div>
					<a href="/plugins?featured=1" class="text-sm text-primary hover:underline">{m.home_see_all()} →</a>
				</div>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each featured as p (p.id)}
						<PluginCard plugin={p} />
					{/each}
				</div>
			</div>
		</section>
	{/if}

	{#if homeCopy.features.enabled}
		<section class="border-b border-border">
			<div class="mx-auto max-w-6xl px-6 py-12 grid gap-8 md:grid-cols-3">
				<div class="space-y-2">
					<Cable class="h-5 w-5 text-primary" />
					<h3 class="font-semibold tracking-tight">{homeCopy.pick(homeCopy.features.dropin.title, i18n.current) ?? m.home_feature_dropin_title()}</h3>
					<p class="text-sm text-muted-foreground">{homeCopy.pick(homeCopy.features.dropin.body, i18n.current) ?? m.home_feature_dropin_body()}</p>
				</div>
				<div class="space-y-2">
					<Boxes class="h-5 w-5 text-primary" />
					<h3 class="font-semibold tracking-tight">{homeCopy.pick(homeCopy.features.providers.title, i18n.current) ?? m.home_feature_providers_title()}</h3>
					<p class="text-sm text-muted-foreground">{homeCopy.pick(homeCopy.features.providers.body, i18n.current) ?? m.home_feature_providers_body()}</p>
				</div>
				<div class="space-y-2">
					<Sparkles class="h-5 w-5 text-primary" />
					<h3 class="font-semibold tracking-tight">{homeCopy.pick(homeCopy.features.release.title, i18n.current) ?? m.home_feature_release_title()}</h3>
					<p class="text-sm text-muted-foreground">{homeCopy.pick(homeCopy.features.release.body, i18n.current) ?? m.home_feature_release_body()}</p>
				</div>
			</div>
		</section>
	{/if}

	<section>
		<div class="mx-auto max-w-6xl px-6 py-16 space-y-6">
			<div class="flex items-baseline justify-between">
				<div>
					<h2 class="text-2xl font-semibold tracking-tight">{m.home_latest_title()}</h2>
					<p class="text-sm text-muted-foreground mt-1">{m.home_latest_subtitle()}</p>
				</div>
				<a href="/plugins" class="text-sm text-primary hover:underline">{m.home_see_all()} →</a>
			</div>

			{#if loading}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each Array(6) as _}
						<Skeleton class="h-36 rounded-lg" />
					{/each}
				</div>
			{:else if recent && recent.length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each recent as p (p.id)}
						<PluginCard plugin={p} />
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border border-dashed border-border p-8 text-center space-y-3">
					<p class="text-muted-foreground">{m.home_no_plugins()}</p>
					<Button size="sm" href="/submit">
						{m.home_submit_first()}
						<ArrowRight class="h-3.5 w-3.5" />
					</Button>
				</div>
			{/if}
		</div>
	</section>
{/if}
