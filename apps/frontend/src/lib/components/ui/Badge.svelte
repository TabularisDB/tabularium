<script lang="ts">
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'

	type Variant = 'default' | 'secondary' | 'outline' | 'destructive'
	let {
		variant = 'default',
		class: className,
		children,
	}: { variant?: Variant; class?: string; children: Snippet } = $props()

	const variants: Record<Variant, string> = {
		default: 'border-transparent bg-primary text-primary-foreground',
		secondary: 'border-transparent bg-secondary text-secondary-foreground',
		outline: 'border-border text-foreground tabularis:bg-background tabularis:text-muted-foreground',
		destructive: 'border-transparent bg-destructive text-destructive-foreground',
	}
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tabularis:border-[0.1rem] tabularis:px-2.5 tabularis:py-[0.2rem] tabularis:text-[0.7rem]',
		variants[variant],
		className,
	)}
>
	{@render children()}
</span>
