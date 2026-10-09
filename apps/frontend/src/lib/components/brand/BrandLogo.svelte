<script lang="ts">
	import Boxes from '@lucide/svelte/icons/boxes'
	import { branding } from '$lib/stores/branding.svelte'
	import { cn } from '$lib/utils'
	import type { Snippet } from 'svelte'

	// `size` scales the square mark and the wordmark height together; the header
	// and footer are the two call sites. `fallback` replaces the default icon
	// shown when no logo is configured.
	let { size = 'md', fallback }: { size?: 'md' | 'lg'; fallback?: Snippet } = $props()

	const markBox = $derived(size === 'lg' ? 'h-10 w-10' : 'h-8 w-8')
	// lg matches the tabularis.dev footer wordmark (12rem wide at its 2400×489 ratio).
	const wordmarkHeight = $derived(size === 'lg' ? 'h-[2.45rem]' : 'h-7')
	const wordmark = $derived(branding.logoStyle === 'wordmark' && !!branding.logoUrl)
</script>

{#if wordmark}
	<!-- Wordmarks carry the name, so the text label is dropped. The light-mode
	     variant (if any) swaps in via the `dark` class mode-watcher manages. -->
	<img
		src={branding.logoUrl}
		alt={branding.name}
		class={cn(wordmarkHeight, 'w-auto max-w-48 object-contain', branding.logoLightUrl && 'hidden dark:block')}
	/>
	{#if branding.logoLightUrl}
		<img
			src={branding.logoLightUrl}
			alt={branding.name}
			class={cn(wordmarkHeight, 'w-auto max-w-48 object-contain dark:hidden')}
		/>
	{/if}
{:else}
	{#if branding.logoUrl}
		<img src={branding.logoUrl} alt="" class={cn(markBox, 'rounded-md object-contain')} />
	{:else}
		<span class={cn(markBox, 'inline-flex items-center justify-center rounded-md bg-primary/10 text-primary')}>
			{#if fallback}{@render fallback()}{:else}<Boxes class={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />{/if}
		</span>
	{/if}
	<span class={cn('truncate', size === 'lg' && 'text-base')}>{branding.name}</span>
{/if}
