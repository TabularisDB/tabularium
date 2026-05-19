<script lang="ts">
	import type { Component, Snippet } from 'svelte'
	import { cn } from '$lib/utils'

	type Props = {
		icon?: Component
		title: string
		body?: string
		actions?: Snippet
		templates?: Snippet
		templatesLabel?: string
		class?: string
	}

	let { icon: Icon, title, body, actions, templates, templatesLabel, class: className }: Props = $props()
</script>

<div class={cn('rounded-lg border border-dashed border-border bg-card/30 p-8 text-center space-y-4', className)}>
	{#if Icon}
		<div class="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
			<Icon class="h-5 w-5" />
		</div>
	{/if}
	<div class="space-y-1">
		<p class="text-sm font-medium">{title}</p>
		{#if body}
			<p class="text-xs text-muted-foreground max-w-md mx-auto">{body}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap justify-center gap-2">
			{@render actions()}
		</div>
	{/if}
	{#if templates}
		<div class="pt-3 border-t border-border/40 space-y-2">
			{#if templatesLabel}
				<p class="text-[11px] uppercase tracking-wider text-muted-foreground">{templatesLabel}</p>
			{/if}
			<div class="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
				{@render templates()}
			</div>
		</div>
	{/if}
</div>
