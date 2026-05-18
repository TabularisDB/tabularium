<script lang="ts">
	import { Tabs } from 'bits-ui'
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'

	let {
		value = $bindable(),
		class: className,
		children,
	}: { value: string; class?: string; children: Snippet } = $props()
</script>

<Tabs.Root bind:value class={className}>
	{@render children()}
</Tabs.Root>
