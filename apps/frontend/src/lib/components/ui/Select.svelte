<script lang="ts">
	import { cn } from '$lib/utils'
	import type { HTMLSelectAttributes } from 'svelte/elements'
	import type { Snippet } from 'svelte'

	type Props = { class?: string; value?: string; children: Snippet } & Omit<
		HTMLSelectAttributes,
		'class' | 'value' | 'children'
	>
	let { class: className, value = $bindable(''), children, ...rest }: Props = $props()
</script>

<select
	bind:value
	class={cn(
		'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
		'tabularis:h-10 tabularis:pr-9 tabularis:border-[0.1rem] tabularis:border-border tabularis:bg-transparent tabularis:shadow-none tabularis:hover:border-border-strong tabularis:focus-visible:ring-0 tabularis:focus-visible:border-brand-accent',
		className,
	)}
	{...rest}
>
	{@render children()}
</select>
