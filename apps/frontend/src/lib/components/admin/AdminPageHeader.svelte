<script lang="ts">
	import { cn } from '$lib/utils'
	import type { Component, Snippet } from 'svelte'

	type Props = {
		title: string
		subtitle?: string
		icon?: Component
		class?: string
		actions?: Snippet
		meta?: Snippet
		subtitleSnippet?: Snippet
	}

	let {
		title,
		subtitle,
		icon: Icon,
		class: className,
		actions,
		meta,
		subtitleSnippet,
	}: Props = $props()
</script>

<header class={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
	<div class="space-y-1 min-w-0">
		<h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
			{#if Icon}
				<Icon class="h-5 w-5 text-primary" />
			{/if}
			{title}
		</h1>
		{#if subtitleSnippet}
			<p class="text-sm text-muted-foreground">{@render subtitleSnippet()}</p>
		{:else if subtitle}
			<p class="text-sm text-muted-foreground">{subtitle}</p>
		{/if}
		{#if meta}
			<div class="pt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				{@render meta()}
			</div>
		{/if}
	</div>
	{#if actions}
		<div class="flex items-center gap-2 shrink-0">
			{@render actions()}
		</div>
	{/if}
</header>
