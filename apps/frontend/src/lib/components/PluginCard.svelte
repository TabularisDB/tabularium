<script lang="ts">
	import { cn } from '$lib/utils'
	import Badge from '$components/ui/Badge.svelte'
	import Boxes from '@lucide/svelte/icons/boxes'
	import type { Plugin } from '$lib/types'

	let { plugin, class: className }: { plugin: Plugin; class?: string } = $props()
</script>

<a
	href={`/plugins/${plugin.id}`}
	class={cn('group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40', className)}
>
	<div class="flex items-start gap-3">
		<div class="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center overflow-hidden flex-shrink-0">
			{#if plugin.iconUrl}
				<img src={plugin.iconUrl} alt={plugin.name} class="h-10 w-10 object-contain" loading="lazy" decoding="async" />
			{:else}
				<Boxes class="h-5 w-5" />
			{/if}
		</div>
		<div class="min-w-0 flex-1 space-y-1.5">
			<div class="flex items-start justify-between gap-2">
				<h3 class="font-semibold tracking-tight group-hover:text-primary transition-colors truncate">{plugin.name}</h3>
				{#if plugin.latestVersion}
					<Badge variant="secondary" class="font-mono text-[10px] flex-shrink-0">v{plugin.latestVersion}</Badge>
				{/if}
			</div>
			<p class="text-sm text-muted-foreground line-clamp-2">{plugin.description}</p>
		</div>
	</div>
	<div class="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
		<span class="truncate">{plugin.author.split('<')[0].trim()}</span>
		<div class="flex items-center gap-1.5 flex-shrink-0">
			{#if plugin.category}
				<Badge variant="outline" class="text-[10px]">{plugin.category}</Badge>
			{/if}
			{#if plugin.license}
				<span class="font-mono text-[10px]">{plugin.license}</span>
			{/if}
		</div>
	</div>
</a>
