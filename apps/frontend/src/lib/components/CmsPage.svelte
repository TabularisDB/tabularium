<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { hydrateWidgets } from '$lib/widgets'

	let { html, container = 'prose' }: { html: string; container?: 'prose' | 'plain' } = $props()

	let host: HTMLElement
	let cleanup: (() => void) | null = null

	function rehydrate() {
		if (cleanup) cleanup()
		cleanup = hydrateWidgets(host)
	}

	onMount(rehydrate)
	onDestroy(() => cleanup?.())

	$effect(() => {
		void html
		if (host) rehydrate()
	})
</script>

<div bind:this={host} class={container === 'prose' ? 'prose prose-sm dark:prose-invert max-w-none' : ''}>
	{@html html}
</div>
