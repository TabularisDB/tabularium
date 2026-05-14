<script lang="ts">
	import { page } from '$app/state'
	import Button from '$components/ui/Button.svelte'
	import Frown from '@lucide/svelte/icons/frown'
	import { m } from '$lib/paraglide/messages'
</script>

<div class="mx-auto max-w-md px-6 py-24 text-center space-y-6">
	<div class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mx-auto">
		<Frown class="h-7 w-7" />
	</div>
	<div class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">
			{page.status} — {page.error?.message ?? m.error_default_message()}
		</h1>
		<p class="text-muted-foreground">
			{#if page.status === 404}
				{m.error_404_body()}
			{:else}
				{m.error_generic_body()}
			{/if}
		</p>
	</div>
	<div class="flex justify-center gap-2">
		<Button href="/">{m.error_back_home()}</Button>
		<Button variant="outline" href="/plugins">{m.error_browse_plugins()}</Button>
	</div>
</div>
