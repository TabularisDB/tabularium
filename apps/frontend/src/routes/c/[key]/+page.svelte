<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import Button from '$components/ui/Button.svelte'
	import PluginCard from '$components/PluginCard.svelte'
	import { eden } from '$lib/eden'
	import type { Plugin, PluginListResponse, Kind } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	const key = $derived(page.params.key ?? '')

	let kind = $state<Kind | null>(null)
	let plugins = $state<Plugin[] | null>(null)
	let total = $state(0)
	let loading = $state(true)
	let notFound = $state(false)

	async function load(currentKey: string) {
		if (!currentKey) {
			notFound = true
			loading = false
			return
		}
		loading = true
		notFound = false
		try {
			const { data: kindsData, error: kindsErr } = await eden.api.kinds.get()
			if (kindsErr) throw kindsErr
			const list = (kindsData as { kinds: Kind[] }).kinds
			const match = list.find((k) => k.key === currentKey && k.publicPageEnabled)
			if (!match) {
				notFound = true
				return
			}
			kind = match

			const { data: plugData, error: plugErr } = await eden.api.plugins.get({
				query: { kind: currentKey, limit: '24', sort: 'updated' },
			})
			if (plugErr) throw plugErr
			const resp = plugData as PluginListResponse
			plugins = resp.plugins
			total = resp.total
		} catch {
			notFound = true
		} finally {
			loading = false
		}
	}

	onMount(() => void load(key))

	$effect(() => {
		void key
		load(key)
	})
</script>

{#if loading && !plugins}
	<div class="mx-auto max-w-6xl px-6 py-12 space-y-8">
		<Skeleton class="h-10 w-2/3 rounded" />
		<Skeleton class="h-5 w-1/2 rounded" />
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each Array(6) as _}
				<Skeleton class="h-36 rounded-lg" />
			{/each}
		</div>
	</div>
{:else if notFound || !kind}
	<div class="mx-auto max-w-3xl px-6 py-24 text-center space-y-4">
		<h1 class="text-3xl font-semibold tracking-tight">{m.kind_page_not_found_title()}</h1>
		<p class="text-muted-foreground">{m.kind_page_not_found_body()}</p>
		<Button variant="outline" size="sm" onclick={() => goto('/plugins')}>{m.kind_page_browse_all()}</Button>
	</div>
{:else}
	<div class="mx-auto max-w-6xl px-6 py-12 space-y-10">
		<header class="space-y-3">
			<h1 class="text-3xl font-semibold tracking-tight">{kind.publicPageCopy?.hero ?? kind.label}</h1>
			{#if kind.publicPageCopy?.intro}
				<p class="text-muted-foreground max-w-2xl">{kind.publicPageCopy.intro}</p>
			{:else if kind.description}
				<p class="text-muted-foreground max-w-2xl">{kind.description}</p>
			{/if}
			<p class="text-xs text-muted-foreground">{m.kind_page_total({ count: total, kind: kind.label })}</p>
		</header>

		{#if plugins && plugins.length > 0}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each plugins as p (p.id)}
					<PluginCard plugin={p} />
				{/each}
			</div>
		{:else}
			<div class="rounded-lg border border-dashed border-border p-12 text-center space-y-3">
				<p class="text-muted-foreground">{m.kind_page_empty({ kind: kind.label })}</p>
				<Button variant="outline" size="sm" onclick={() => goto('/plugins')}>{m.kind_page_browse_all()}</Button>
			</div>
		{/if}
	</div>
{/if}
