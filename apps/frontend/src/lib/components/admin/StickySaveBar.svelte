<script lang="ts">
	import Save from '@lucide/svelte/icons/save'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import Button from '$components/ui/Button.svelte'
	import { m } from '$lib/paraglide/messages'
	import { cn } from '$lib/utils'

	type Props = {
		dirty: boolean
		saving?: boolean
		onSave: () => void
		onDiscard?: () => void
		message?: string
		saveLabel?: string
		discardLabel?: string
		class?: string
	}

	let {
		dirty,
		saving = false,
		onSave,
		onDiscard,
		message,
		saveLabel,
		discardLabel,
		class: className,
	}: Props = $props()

	const visible = $derived(dirty || saving)
</script>

<div
	class={cn(
		'sticky bottom-0 -mx-6 px-6 py-3 mt-6 bg-background/95 backdrop-blur-md border-t border-border z-20',
		'flex items-center justify-between gap-3 transition-opacity',
		visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
		className,
	)}
>
	<span class="text-xs text-muted-foreground inline-flex items-center gap-2">
		<span class="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" aria-hidden="true"></span>
		{message ?? m.admin_common_unsaved_changes()}
	</span>
	<div class="flex items-center gap-2">
		{#if onDiscard}
			<Button variant="ghost" size="sm" onclick={onDiscard} disabled={saving}>
				<RotateCcw class="h-3.5 w-3.5" />
				{discardLabel ?? m.admin_common_discard()}
			</Button>
		{/if}
		<Button size="sm" onclick={onSave} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? m.common_saving() : (saveLabel ?? m.common_save())}
		</Button>
	</div>
</div>
