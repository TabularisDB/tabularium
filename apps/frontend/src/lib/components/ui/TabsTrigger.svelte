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
		// tabularis.dev filter pills: outlined, full radius, active = foreground border.
		'tabularis:rounded-full tabularis:border-[0.1rem] tabularis:border-border tabularis:px-3.5 tabularis:py-2 tabularis:hover:border-border-strong tabularis:data-[state=active]:border-foreground tabularis:data-[state=active]:bg-transparent tabularis:data-[state=active]:font-semibold tabularis:data-[state=active]:shadow-none',
		className,
	)}
>
	{@render children()}
</Tabs.Trigger>
