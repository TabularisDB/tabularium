<script lang="ts">
	import { onMount } from 'svelte'
	import Boxes from '@lucide/svelte/icons/boxes'
	import MessageSquare from '@lucide/svelte/icons/message-square'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import { api } from '$lib/api'
	import type { PluginListResponse } from '$lib/types'

	let { heading = '' }: { heading?: string } = $props()

	let pluginsTotal = $state<number | null>(null)
	let requestsTotal = $state<number | null>(null)

	onMount(async () => {
		try {
			const [p, r] = await Promise.all([
				api.get<PluginListResponse>('/api/plugins?limit=1'),
				api.get<{ total: number }>('/api/requests?limit=1'),
			])
			pluginsTotal = p.total
			requestsTotal = r.total
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
