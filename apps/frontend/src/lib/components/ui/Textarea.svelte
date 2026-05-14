<script lang="ts">
	import { cn } from '$lib/utils'
	import type { HTMLTextareaAttributes } from 'svelte/elements'

	type Props = { class?: string; value?: string } & Omit<HTMLTextareaAttributes, 'class' | 'value'>
	let { class: className, value = $bindable(''), ...rest }: Props = $props()
</script>

<textarea
	bind:value
	class={cn(
		'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
		className,
	)}
	{...rest}
></textarea>
