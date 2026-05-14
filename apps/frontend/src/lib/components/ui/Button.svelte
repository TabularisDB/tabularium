<script lang="ts">
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements'

	type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'link'
	type Size = 'sm' | 'md' | 'lg' | 'icon'

	type Props = {
		variant?: Variant
		size?: Size
		href?: string
		class?: string
		children: Snippet
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'class' | 'children'>

	let { variant = 'default', size = 'md', href, class: className, children, ...rest }: Props = $props()

	const base =
		'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer'
	const variants: Record<Variant, string> = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
		ghost: 'hover:bg-accent hover:text-accent-foreground',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
		link: 'text-primary underline-offset-4 hover:underline',
	}
	const sizes: Record<Size, string> = {
		sm: 'h-8 px-3',
		md: 'h-9 px-4',
		lg: 'h-10 px-6',
		icon: 'h-9 w-9',
	}

	const classes = $derived(cn(base, variants[variant], sizes[size], className))
</script>

{#if href}
	<a {href} class={classes} {...rest as HTMLAnchorAttributes}>
		{@render children()}
	</a>
{:else}
	<button class={classes} {...rest as HTMLButtonAttributes}>
		{@render children()}
	</button>
{/if}
