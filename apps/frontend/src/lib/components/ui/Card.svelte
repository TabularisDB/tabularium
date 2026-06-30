<script lang="ts">
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'
	let {
		class: className,
		id,
		children,
	}: { class?: string; id?: string; children: Snippet } = $props()
</script>

<div {id} class={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)}>
	{@render children()}
</div>
