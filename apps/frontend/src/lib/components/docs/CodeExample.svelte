<script lang="ts">
	import { toast } from 'svelte-sonner'
	import Copy from '@lucide/svelte/icons/copy'
	import { m } from '$lib/paraglide/messages'

	let { yaml, json }: { yaml: string; json: string } = $props()
	let mode = $state<'yaml' | 'json'>('yaml')

	async function copy() {
		try {
			await navigator.clipboard.writeText(mode === 'yaml' ? yaml : json)
			toast.success(m.docs_copied())
		} catch {
			toast.error(m.docs_copied())
		}
	}
</script>

<div class="rounded-md border border-border overflow-hidden">
	<div class="flex border-b border-border bg-muted/40 items-center">
		<button
			type="button"
			class={[
				'px-3 py-1.5 text-xs font-medium transition-colors',
				mode === 'yaml'
					? 'bg-background text-foreground border-b-2 border-primary -mb-px'
					: 'text-muted-foreground hover:text-foreground',
			].join(' ')}
			onclick={() => (mode = 'yaml')}
		>
			{m.docs_example_yaml()}
		</button>
		<button
			type="button"
			class={[
				'px-3 py-1.5 text-xs font-medium transition-colors',
				mode === 'json'
					? 'bg-background text-foreground border-b-2 border-primary -mb-px'
					: 'text-muted-foreground hover:text-foreground',
			].join(' ')}
			onclick={() => (mode = 'json')}
		>
			{m.docs_example_json()}
		</button>
		<button
			type="button"
			class="ml-auto mr-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
			onclick={copy}
		>
			<Copy class="h-3 w-3" />
			{m.docs_copy()}
		</button>
	</div>
	<pre class="text-xs px-3 py-3 overflow-x-auto"><code>{mode === 'yaml' ? yaml : json}</code></pre>
</div>
