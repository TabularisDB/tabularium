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

<div class={cn('relative rounded-md border border-border bg-card', className)}>
	<pre class="overflow-x-auto p-4 text-xs font-mono text-foreground">{value}</pre>
	<button
		type="button"
		onclick={copy}
		class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
		aria-label="Copy"
	>
		{#if copied}
			<Check class="h-3.5 w-3.5" />
		{:else}
			<Copy class="h-3.5 w-3.5" />
		{/if}
	</button>
</div>
