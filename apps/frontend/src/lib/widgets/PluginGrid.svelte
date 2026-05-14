<script lang="ts">
	import { onMount } from 'svelte'
	import PluginCard from '$components/PluginCard.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import { api } from '$lib/api'
	import type { Plugin, PluginListResponse } from '$lib/types'

	type Props = {
		limit?: number
		cols?: number
		category?: string
		tag?: string
		sort?: 'updated' | 'new' | 'name' | 'featured'
		heading?: string
	}
	let { limit = 6, cols = 3, category = '', tag = '', sort = 'updated', heading = '' }: Props = $props()

	let plugins = $state<Plugin[] | null>(null)

	onMount(async () => {
		try {
			const q = new URLSearchParams({ limit: String(limit), sort })
			if (category) q.set('category', category)
			if (tag) q.set('tag', tag)
			const data = await api.get<PluginListResponse>(`/api/plugins?${q}`)
			plugins = data.plugins
		} catch {
			plugins = []
		}
	})

	const gridClass = $derived(
		cols === 1 ? 'grid-cols-1' :
		cols === 2 ? 'grid-cols-1 sm:grid-cols-2' :
		cols === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
		'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
	)
</script>

<div class="space-y-3 not-prose">
	{#if heading}<h3 class="text-lg font-semibold tracking-tight">{heading}</h3>{/if}
	{#if plugins === null}
		<div class={`grid gap-4 ${gridClass}`}>
			{#each Array(limit) as _}<Skeleton class="h-32 rounded-lg" />{/each}
		</div>
	{:else if plugins.length === 0}
		<p class="text-sm text-muted-foreground">No matching plugins.</p>
	{:else}
		<div class={`grid gap-4 ${gridClass}`}>
			{#each plugins as p (p.id)}<PluginCard plugin={p} />{/each}
		</div>
	{/if}
</div>
