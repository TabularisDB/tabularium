<script lang="ts">
	import { cn } from '$lib/utils'
	import Copy from '@lucide/svelte/icons/copy'
	import Check from '@lucide/svelte/icons/check'

	let { value, class: className }: { value: string; class?: string } = $props()
	let copied = $state(false)

	async function copy() {
		if (!navigator.clipboard) return
		await navigator.clipboard.writeText(value)
		copied = true
		setTimeout(() => (copied = false), 1500)
	}
</script>

<div class={cn('flex items-start rounded-md border border-border bg-card', className)}>
	<pre class="min-w-0 flex-1 overflow-x-auto p-4 pr-2 text-xs font-mono text-foreground">{value}</pre>
	<button
		type="button"
		onclick={copy}
		class="mr-2 mt-2 inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
		aria-label="Copy"
	>
		{#if copied}
			<Check class="h-3.5 w-3.5" />
		{:else}
			<Copy class="h-3.5 w-3.5" />
		{/if}
	</button>
</div>
