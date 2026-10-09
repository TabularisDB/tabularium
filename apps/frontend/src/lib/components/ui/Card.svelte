<script lang="ts">
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'
	let { class: className, children }: { class?: string; children: Snippet } = $props()
</script>

<div
	class={cn(
		'rounded-lg border border-border bg-card text-card-foreground shadow-sm tabularis:rounded-md tabularis:border-[0.1rem] tabularis:shadow-none',
		className,
	)}
>
	{@render children()}
</div>
