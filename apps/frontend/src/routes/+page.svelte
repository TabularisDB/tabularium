<script lang="ts">
	import { onMount } from 'svelte'
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import Plug from '@lucide/svelte/icons/plug'
	import Webhook from '@lucide/svelte/icons/webhook'
	import Globe from '@lucide/svelte/icons/globe'
	import { PROVIDER_MARKS } from '$lib/provider-marks'
	import Star from '@lucide/svelte/icons/star'
	import PluginSearch from '$components/PluginSearch.svelte'
	import Button from '$components/ui/Button.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import PluginCard from '$components/PluginCard.svelte'
	import CmsPage from '$components/CmsPage.svelte'
	import CompanionAppSection from '$components/CompanionAppSection.svelte'
	import { eden } from '$lib/eden'
	import { branding } from '$lib/stores/branding.svelte'
	import { homeCopy } from '$lib/stores/home-copy.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'
	import { features as instanceFeatures } from '$lib/stores/features.svelte'
	import { formatDownloadCount } from '$lib/downloads'
	import { m } from '$lib/paraglide/messages'
	import type { Plugin, PluginListResponse, PageRendered } from '$lib/types'

	type Stats = { plugins: number; downloads: number; authors: number; requests: number; kinds: number }

	// The icon strip only reads as "an ecosystem" once there are enough logos.
	const MARQUEE_MIN_ICONS = 6

	let customHomepage = $state<PageRendered | null>(null)
	let homepageChecked = $state(false)

	let featured = $state<Plugin[] | null>(null)
	let recent = $state<Plugin[] | null>(null)
	let total = $state(0)
	let loading = $state(true)
	let stats = $state<Stats | null>(null)
	let marqueePool = $state<Plugin[]>([])
	let kindFacets = $state<PluginListResponse['facets']['kinds']>([])

	// Unique plugins that ship an icon, featured first.
	const marqueePlugins = $derived.by(() => {
		const seen = new Set<string>()
		return marqueePool.filter((p) => {
			if (!p.iconUrl || seen.has(p.id)) return false
			seen.add(p.id)
			return true
		})
	})

	const statItems = $derived(
		stats
			? [
					{ key: 'plugins', value: stats.plugins.toLocaleString(i18n.current), label: m.home_stat_plugins() },
					{
						key: 'downloads',
						value: formatDownloadCount(stats.downloads, i18n.current),
						label: m.home_stat_downloads(),
					},
					{ key: 'authors', value: stats.authors.toLocaleString(i18n.current), label: m.home_stat_authors() },
					...(instanceFeatures.requestsEnabled
						? [{ key: 'requests', value: stats.requests.toLocaleString(i18n.current), label: m.home_stat_requests() }]
						: []),
				]
			: [],
	)

	const FEATURE_KEYS = ['dropin', 'providers', 'release'] as const
	// Plug: clients plug the registry in. Webhook: releases arrive by webhook.
	const FEATURE_ICONS = { dropin: Plug, release: Webhook } as const

	const FEATURE_FALLBACK = {
		dropin: { title: m.home_feature_dropin_title, body: m.home_feature_dropin_body },
		providers: { title: m.home_feature_providers_title, body: m.home_feature_providers_body },
		release: { title: m.home_feature_release_title, body: m.home_feature_release_body },
	}

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
			eden.api.stats
				.get()
				.then(({ data }: { data: unknown }) => {
					if (data) stats = data as Stats
				})
				.catch(() => {})
			const [featRes, recRes] = await Promise.all([
				eden.api.plugins.get({ query: { featured: '1', sort: 'featured', limit: '12' } }),
				eden.api.plugins.get({ query: { sort: 'new', limit: '12' } }),
			])
			if (featRes.error) throw featRes.error
			if (recRes.error) throw recRes.error
			const feat = featRes.data as PluginListResponse
			const rec = recRes.data as PluginListResponse
			featured = feat.plugins.slice(0, 6)
			recent = rec.plugins.slice(0, 6)
			total = rec.total
			kindFacets = rec.facets.kinds.filter((k) => k.count > 0)
			// Keep the larger pages around just for the icon strip.
			marqueePool = [...feat.plugins, ...rec.plugins]
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
		<div class="hero-aurora" aria-hidden="true"></div>
		<div class="mx-auto max-w-6xl px-6 pt-20 pb-14 sm:pt-28 sm:pb-16 text-center">
			{#if homeCopy.eyebrow.enabled}
				<div
					class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-8"
				>
					<Globe class="h-3 w-3 text-primary" />
					{homeCopy.pick(homeCopy.eyebrow.text, i18n.current) ?? m.home_eyebrow()}
				</div>
			{/if}
			<h1 class="text-4xl sm:text-6xl font-semibold tracking-tight text-foreground">
				{branding.name}<span class="text-primary">.</span>
			</h1>
			<p class="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
				{branding.tagline}
			</p>

			<PluginSearch class="mx-auto mt-10 max-w-xl" />

			{#if kindFacets.length > 0}
				<div class="mt-5 flex flex-wrap items-center justify-center gap-1.5">
					{#each kindFacets as k (k.key)}
						<a
							href={`/plugins?kind=${encodeURIComponent(k.key)}`}
							class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
						>
							{k.label}
							<span class="font-mono text-[10px] opacity-70">{k.count}</span>
						</a>
					{/each}
				</div>
			{/if}

			<p class="mt-6 text-sm text-muted-foreground">
				<a href="/plugins" class="hover:text-foreground transition-colors">{m.home_browse_plugins()}</a>
				{#if instanceFeatures.submissionsEnabled}
					<span class="mx-2 opacity-50">·</span>
					<a href="/submit" class="text-primary hover:underline">{m.home_submit_plugin()} →</a>
				{/if}
			</p>

			{#if statItems.length > 0 && stats && stats.plugins > 0}
				<dl
					class="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-y-6 border-t border-border pt-8 sm:flex sm:justify-center sm:gap-x-16"
				>
					{#each statItems as item (item.key)}
						<div class="flex flex-col items-center gap-1">
							<dt class="order-2 text-xs uppercase tracking-wider text-muted-foreground">{item.label}</dt>
							<dd class="order-1 text-2xl font-semibold text-foreground tabular-nums tabularis:font-medium">
								{item.value}
							</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</div>

		{#if marqueePlugins.length >= MARQUEE_MIN_ICONS}
			<div class="marquee relative border-t border-border/60 py-6" aria-label={m.home_marquee_label()}>
				<div class="marquee-track flex w-max gap-4">
					{#each [0, 1] as copy (copy)}
						{#each marqueePlugins as p (`${copy}-${p.id}`)}
							<a
								href={`/plugins/${p.id}`}
								title={p.name}
								aria-hidden={copy === 1 ? 'true' : undefined}
								tabindex={copy === 1 ? -1 : undefined}
								class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-primary/40 tabularis:rounded-md"
							>
								<img
									src={p.iconUrl}
									alt={copy === 1 ? '' : p.name}
									class="h-full w-full object-contain"
									loading="lazy"
								/>
							</a>
						{/each}
					{/each}
				</div>
			</div>
		{/if}
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
			<div class="mx-auto max-w-6xl px-6 py-16 grid gap-4 md:grid-cols-3">
				{#each FEATURE_KEYS as key (key)}
					<div
						class="feature-card overflow-hidden rounded-lg border border-border bg-card tabularis:rounded-md tabularis:border-[0.1rem]"
					>
						<div class="feature-cover relative flex h-28 items-center justify-center border-b border-border">
							{#if key === 'providers'}
								<!-- The real provider marks say more than a generic icon. -->
								<span class="relative z-10 flex items-center gap-2">
									{#each PROVIDER_MARKS as mark (mark.key)}
										<span
											title={mark.label}
											class="provider-mark inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors tabularis:rounded-md"
											style:--brand={mark.color}
										>
											<svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-label={mark.label} role="img">
												<path d={mark.path} />
											</svg>
										</span>
									{/each}
								</span>
							{:else}
								{@const Icon = FEATURE_ICONS[key]}
								<span
									class="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background text-primary tabularis:rounded-md"
								>
									<Icon class="h-5 w-5" />
								</span>
							{/if}
						</div>
						<div class="space-y-2 p-5">
							<h3 class="font-semibold tracking-tight">
								{homeCopy.pick(homeCopy.features[key].title, i18n.current) ?? FEATURE_FALLBACK[key].title()}
							</h3>
							<p class="text-sm text-muted-foreground">
								{homeCopy.pick(homeCopy.features[key].body, i18n.current) ?? FEATURE_FALLBACK[key].body()}
							</p>
						</div>
					</div>
				{/each}
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

	<CompanionAppSection />
{/if}

<style>
	/* Dot grid behind the feature icons, faded at the edges (tabularis.dev plugin cards). */
	.feature-cover::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
		background-size: 16px 16px;
		mask-image: radial-gradient(ellipse at center, black 40%, transparent 85%);
		pointer-events: none;
	}

	.provider-mark:hover {
		color: var(--brand);
		border-color: color-mix(in srgb, var(--brand) 40%, transparent);
	}

	.marquee {
		overflow: hidden;
		mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
	}
	.marquee-track {
		animation: marquee 40s linear infinite;
	}
	.marquee:hover .marquee-track {
		animation-play-state: paused;
	}
	@keyframes marquee {
		/* The track holds two copies; shifting by one copy (+ half the gap) loops seamlessly. */
		to {
			transform: translateX(calc(-50% - 0.5rem));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.marquee-track {
			animation: none;
		}
	}
</style>
