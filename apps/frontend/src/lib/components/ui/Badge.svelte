<script lang="ts">
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'

	type Variant = 'default' | 'secondary' | 'outline' | 'destructive'
	let { variant = 'default', class: className, children }: { variant?: Variant; class?: string; children: Snippet } = $props()

	const variants: Record<Variant, string> = {
		default: 'border-transparent bg-primary text-primary-foreground',
		secondary: 'border-transparent bg-secondary text-secondary-foreground',
		outline: 'border-border text-foreground',
		destructive: 'border-transparent bg-destructive text-destructive-foreground',
	}
</script>

<span class={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
	{@render children()}
</span>
