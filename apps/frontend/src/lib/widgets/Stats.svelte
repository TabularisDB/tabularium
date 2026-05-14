<script lang="ts">
	import { onMount } from 'svelte'
	import Boxes from '@lucide/svelte/icons/boxes'
	import MessageSquare from '@lucide/svelte/icons/message-square'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import { eden } from '$lib/eden'
	import type { PluginListResponse } from '$lib/types'

	let { heading = '' }: { heading?: string } = $props()

	let pluginsTotal = $state<number | null>(null)
	let requestsTotal = $state<number | null>(null)

	onMount(async () => {
		try {
			const [pluginsRes, requestsRes] = await Promise.all([
				eden.api.plugins.get({ query: { limit: '1' } }),
				eden.api.requests.get({ query: { limit: '1' } }),
			])
			if (pluginsRes.error) throw pluginsRes.error
			if (requestsRes.error) throw requestsRes.error
			pluginsTotal = (pluginsRes.data as PluginListResponse).total
			requestsTotal = (requestsRes.data as { total: number }).total
		} catch {
			pluginsTotal = 0
			requestsTotal = 0
		}
	})
</script>

<div class="space-y-3 not-prose">
	{#if heading}<h3 class="text-lg font-semibold tracking-tight">{heading}</h3>{/if}
	<div class="grid grid-cols-2 gap-3">
		<Card>
			<CardContent class="p-5 space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">Plugins</span>
					<Boxes class="h-4 w-4 text-muted-foreground" />
				</div>
				<div class="text-3xl font-semibold tracking-tight">{pluginsTotal ?? '—'}</div>
			</CardContent>
		</Card>
		<Card>
			<CardContent class="p-5 space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">Open requests</span>
					<MessageSquare class="h-4 w-4 text-muted-foreground" />
				</div>
				<div class="text-3xl font-semibold tracking-tight">{requestsTotal ?? '—'}</div>
			</CardContent>
		</Card>
	</div>
</div>
