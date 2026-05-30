<script lang="ts">
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'

	let {
		size = 'sm',
		verifiedAt = null,
		class: className,
	}: { size?: 'sm' | 'md'; verifiedAt?: number | null; class?: string } = $props()

	const titleLabel = $derived(
		verifiedAt
			? m.verified_badge_tooltip({ date: new Date(verifiedAt).toLocaleDateString() })
			: m.verified_badge_label(),
	)
</script>

<span
	class={cn(
		'inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 font-medium',
		size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
		className,
	)}
	title={titleLabel}
	aria-label={titleLabel}
>
	<ShieldCheck class={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
	{#if size === 'md'}<span>{m.verified_badge_label()}</span>{/if}
</span>
