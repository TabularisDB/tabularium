<script lang="ts">
	import { Dialog } from 'bits-ui'
	import X from '@lucide/svelte/icons/x'
	import type { Snippet } from 'svelte'
	import { m } from '$lib/paraglide/messages'

	type Props = {
		open: boolean
		title: string
		description?: string
		children: Snippet
		footer?: Snippet
	}

	let { open = $bindable(), title, description, children, footer }: Props = $props()
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl focus:outline-none"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<Dialog.Title class="text-base font-semibold tracking-tight">{title}</Dialog.Title>
					{#if description}
						<Dialog.Description class="text-sm text-muted-foreground mt-1.5">{description}</Dialog.Description>
					{/if}
				</div>
				<Dialog.Close
					class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent"
					aria-label={m.common_close()}
				>
					<X class="h-4 w-4" />
				</Dialog.Close>
			</div>

			<div class="mt-5">
				{@render children()}
			</div>

			{#if footer}
				<div class="mt-5 flex items-center justify-end gap-2">
					{@render footer()}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
