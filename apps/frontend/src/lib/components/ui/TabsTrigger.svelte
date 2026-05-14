<script lang="ts">
	import { Tabs } from 'bits-ui'
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'
	let { value, class: className, children }: { value: string; class?: string; children: Snippet } = $props()
</script>

<Tabs.Trigger
	{value}
	class={cn(
		'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
		className,
	)}
>
	{@render children()}
</Tabs.Trigger>
