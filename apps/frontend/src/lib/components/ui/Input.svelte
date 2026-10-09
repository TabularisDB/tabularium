<script lang="ts">
	import { cn } from '$lib/utils'
	import type { HTMLInputAttributes } from 'svelte/elements'

	type Props = { class?: string; value?: string } & Omit<HTMLInputAttributes, 'class' | 'value'>
	let { class: className, value = $bindable(''), ...rest }: Props = $props()
</script>

<input
	bind:value
	class={cn(
		'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
		'tabularis:h-10 tabularis:border-[0.1rem] tabularis:border-border tabularis:bg-transparent tabularis:shadow-none tabularis:hover:border-border-strong tabularis:focus-visible:ring-0 tabularis:focus-visible:border-brand-accent',
		className,
	)}
	{...rest}
/>
