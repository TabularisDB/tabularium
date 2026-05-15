<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'

	type Props = {
		expanded: boolean
		name: string
		summary?: string
		onRemove?: () => void
		removeLabel?: string
		class?: string
		header?: Snippet
		children: Snippet
	}

	let {
		expanded = $bindable(),
		name,
		summary,
		onRemove,
		removeLabel,
		class: className,
		header,
		children,
	}: Props = $props()
</script>

<div
	class={cn(
		'rounded-md border border-border bg-card/30 overflow-hidden transition-colors hover:border-border/80',
		className,
	)}
>
	<div class="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
		<button
			type="button"
			class="flex items-center gap-2 flex-1 min-w-0 text-left"
			onclick={() => (expanded = !expanded)}
		>
			{#if expanded}
				<ChevronDown class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
			{:else}
				<ChevronRight class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
			{/if}
			{#if header}
				{@render header()}
			{:else}
				<code class="font-mono text-sm shrink-0">{name}</code>
				{#if summary}
					<span class="text-xs text-muted-foreground truncate flex-1 min-w-0">{summary}</span>
				{/if}
			{/if}
		</button>
		{#if onRemove}
			<button
				type="button"
				class="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
				onclick={onRemove}
				aria-label={removeLabel ?? 'Remove'}
				title={removeLabel ?? 'Remove'}
			>
				<Trash2 class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>
	{#if expanded}
		<div class="p-3 pt-3 space-y-3 border-t border-border/60 bg-card/50">
			{@render children()}
		</div>
	{/if}
</div>
