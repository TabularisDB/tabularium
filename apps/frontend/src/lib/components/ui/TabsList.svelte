<script lang="ts">
	import { Tabs } from 'bits-ui'
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'
	let { class: className, children }: { class?: string; children: Snippet } = $props()
</script>

<Tabs.List
	class={cn('inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)}
>
	{@render children()}
</Tabs.List>
