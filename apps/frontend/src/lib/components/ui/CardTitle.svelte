<script lang="ts">
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'
	let { class: className, children }: { class?: string; children: Snippet } = $props()
</script>

<h3 class={cn('font-semibold tracking-tight', className)}>{@render children()}</h3>
