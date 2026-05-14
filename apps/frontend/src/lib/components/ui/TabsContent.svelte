<script lang="ts">
	import { Tabs } from 'bits-ui'
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'
	let { value, class: className, children }: { value: string; class?: string; children: Snippet } = $props()
</script>

<Tabs.Content {value} class={cn('mt-2', className)}>{@render children()}</Tabs.Content>
