<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import Search from '@lucide/svelte/icons/search'
	import X from '@lucide/svelte/icons/x'
	import Input from '$components/ui/Input.svelte'
	import Select from '$components/ui/Select.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import Button from '$components/ui/Button.svelte'
	import PluginCard from '$components/PluginCard.svelte'
	import CmsPage from '$components/CmsPage.svelte'
	import { eden } from '$lib/eden'
	import { i18n } from '$lib/stores/i18n.svelte'
	import type { Plugin, PluginListResponse, PageRendered } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	let cmsOverride = $state<PageRendered | null>(null)
	let cmsChecked = $state(false)

	let search = $state('')
	let category = $state('')
	let tag = $state('')
	let sort = $state<'updated' | 'new' | 'name' | 'featured'>('updated')
	let onlyFeatured = $state(false)

	let pageNum = $state(1)
	let total = $state(0)
	let plugins = $state<Plugin[] | null>(null)
	let categories = $state<Array<{ value: string; count: number }>>([])
	let loading = $state(true)
	let debounce: ReturnType<typeof setTimeout> | null = null

	// Sync from URL on first mount so deep-links work.
	onMount(async () => {
		try {
			const { data, error } = await eden.api.pages['by-path'].get({ query: { path: '/plugins', locale: i18n.current } })
			if (error) throw error
			cmsOverride = data as PageRendered
			cmsChecked = true
			return
		} catch {
			cmsChecked = true
		}
		const url = page.url
		search = url.searchParams.get('search') ?? ''
		category = url.searchParams.get('category') ?? ''
		tag = url.searchParams.get('tag') ?? ''
		const s = url.searchParams.get('sort')
		if (s === 'updated' || s === 'new' || s === 'name' || s === 'featured') sort = s
		onlyFeatured = url.searchParams.get('featured') === '1'
		fetchPlugins()
	})

	async function fetchPlugins() {
		loading = true
		try {
			const query: Record<string, string> = { page: String(pageNum), limit: '24', sort }
			if (search.trim()) query.search = search.trim()
			if (category) query.category = category
			if (tag) query.tag = tag
			if (onlyFeatured) query.featured = '1'
			const { data, error } = await eden.api.plugins.get({ query })
			if (error) throw error
			const payload = data as PluginListResponse
			plugins = payload.plugins
			total = payload.total
			categories = payload.facets.categories
		} catch {
			plugins = []
			total = 0
		} finally {
			loading = false
		}
	}

	$effect(() => {
		void search
		if (debounce) clearTimeout(debounce)
		debounce = setTimeout(() => {
			pageNum = 1
			fetchPlugins()
		}, 200)
	})

	$effect(() => {
		void category
		void tag
		void sort
		void onlyFeatured
		void pageNum
		fetchPlugins()
	})

	const hasActiveFilters = $derived(Boolean(category || tag || onlyFeatured || search))

	function clearFilters() {
		search = ''
		category = ''
		tag = ''
		onlyFeatured = false
		sort = 'updated'
		pageNum = 1
	}
</script>

{#if !cmsChecked}
	<div class="mx-auto max-w-6xl px-6 py-12">
		<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
	</div>
{:else if cmsOverride}
	<div class="mx-auto max-w-4xl px-6 py-12 space-y-6">
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">{cmsOverride.title}</h1>
		</header>
		<CmsPage html={cmsOverride.html} />
	</div>
{:else}
<div class="mx-auto max-w-6xl px-6 py-12 space-y-8">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">{m.plugins_list_title()}</h1>
		<p class="text-muted-foreground">{m.plugins_list_subtitle({ total })}</p>
	</header>

	<div class="flex flex-wrap gap-3 items-center">
		<div class="relative flex-1 min-w-[16rem]">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
			<Input bind:value={search} placeholder={m.plugins_list_search_placeholder()} class="pl-9" />
		</div>
		<Select bind:value={sort}>
			<option value="updated">{m.plugins_list_sort_updated()}</option>
			<option value="new">{m.plugins_list_sort_new()}</option>
			<option value="name">{m.plugins_list_sort_name()}</option>
			<option value="featured">{m.plugins_list_sort_featured()}</option>
		</Select>
		<label class="flex items-center gap-2 text-sm cursor-pointer">
			<input type="checkbox" bind:checked={onlyFeatured} class="h-4 w-4 rounded border-input" />
			<span>{m.plugins_list_featured_only()}</span>
		</label>
		{#if hasActiveFilters}
			<Button variant="ghost" size="sm" onclick={clearFilters}>
				<X class="h-3.5 w-3.5" />
				{m.common_clear()}
			</Button>
		{/if}
	</div>

	{#if categories.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground uppercase tracking-wider mr-1">{m.plugins_list_categories()}</span>
			{#each categories as cat (cat.value)}
				<button
					type="button"
					onclick={() => (category = category === cat.value ? '' : cat.value)}
					class="text-xs"
					aria-pressed={category === cat.value}
				>
					<Badge variant={category === cat.value ? 'default' : 'outline'} class="cursor-pointer">
						{cat.value} <span class="ml-1 opacity-60">{cat.count}</span>
					</Badge>
				</button>
			{/each}
		</div>
	{/if}

	{#if tag}
		<div class="text-sm">
			<Badge variant="default" class="gap-1">
				#{tag}
				<button type="button" onclick={() => (tag = '')} aria-label={m.plugins_list_clear_tag()} class="-mr-1 ml-1">
					<X class="h-3 w-3" />
				</button>
			</Badge>
		</div>
	{/if}

	{#if loading && !plugins}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each Array(6) as _}
				<Skeleton class="h-36 rounded-lg" />
			{/each}
		</div>
	{:else if plugins && plugins.length > 0}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each plugins as p (p.id)}
				<PluginCard plugin={p} />
			{/each}
		</div>
	{:else}
		<div class="rounded-lg border border-dashed border-border p-12 text-center space-y-3">
			<p class="text-muted-foreground">
				{hasActiveFilters ? m.plugins_list_no_filter_match() : m.plugins_list_empty()}
			</p>
			{#if hasActiveFilters}
				<Button variant="outline" size="sm" onclick={clearFilters}>{m.plugins_list_clear_filters()}</Button>
			{:else}
				<Button size="sm" href="/submit">{m.plugins_list_submit_first()}</Button>
			{/if}
		</div>
	{/if}
</div>
{/if}
