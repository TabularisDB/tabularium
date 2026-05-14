<script lang="ts">
	import { onMount } from 'svelte'
	import ThumbsUp from '@lucide/svelte/icons/thumbs-up'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'
	import type { PluginRequest } from '$lib/types'

	let { limit = 5, heading = 'Top community requests' }: { limit?: number; heading?: string } = $props()

	let requests = $state<PluginRequest[] | null>(null)

	onMount(async () => {
		try {
			const { data, error } = await eden.api.requests.get({ query: { sort: 'upvotes', limit: String(limit) } })
			if (error) throw error
			requests = (data as { requests: PluginRequest[] }).requests
		} catch {
			requests = []
		}
	})
</script>

<div class="space-y-3 not-prose">
	{#if heading}<h3 class="text-lg font-semibold tracking-tight">{heading}</h3>{/if}
	{#if requests === null}
		<div class="space-y-2">
			{#each Array(limit) as _}<Skeleton class="h-12 rounded-md" />{/each}
		</div>
	{:else if requests.length === 0}
		<p class="text-sm text-muted-foreground">No requests yet.</p>
	{:else}
		<ul class="space-y-2">
			{#each requests as r (r.id)}
				<li class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2.5">
					<a href={`/requests#${r.id}`} class="flex-1 min-w-0">
						<div class="font-medium truncate">{r.name}</div>
						<div class="text-xs text-muted-foreground font-mono truncate">{r.slug}</div>
					</a>
					<Badge variant="secondary" class="gap-1 flex-shrink-0">
						<ThumbsUp class="h-3 w-3" />
						{r.upvotes}
					</Badge>
				</li>
			{/each}
		</ul>
	{/if}
</div>
