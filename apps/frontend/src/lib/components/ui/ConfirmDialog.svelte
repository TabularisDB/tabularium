<script lang="ts">
	import { AlertDialog } from 'bits-ui'
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert'
	import Button from './Button.svelte'
	import Input from './Input.svelte'
	import { m } from '$lib/paraglide/messages'

	type Props = {
		open: boolean
		title: string
		description: string
		confirmWord: string
		confirmLabel?: string
		cancelLabel?: string
		busy?: boolean
		onConfirm: () => void | Promise<void>
		onCancel?: () => void
	}

	let {
		open = $bindable(),
		title,
		description,
		confirmWord,
		confirmLabel,
		cancelLabel,
		busy = false,
		onConfirm,
		onCancel,
	}: Props = $props()

	let typed = $state('')

	$effect(() => {
		if (!open) typed = ''
	})

	const matched = $derived(typed.trim() === confirmWord)

	function handleCancel() {
		if (busy) return
		open = false
		onCancel?.()
	}

	async function handleConfirm() {
		if (!matched || busy) return
		await onConfirm()
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<AlertDialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl focus:outline-none"
		>
			<div class="flex items-start gap-3">
				<span class="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive shrink-0">
					<AlertTriangle class="h-5 w-5" />
				</span>
				<div class="flex-1 min-w-0">
					<AlertDialog.Title class="text-base font-semibold tracking-tight">{title}</AlertDialog.Title>
					<AlertDialog.Description class="text-sm text-muted-foreground mt-1.5">
						{description}
					</AlertDialog.Description>
				</div>
			</div>

			<div class="mt-5 space-y-2">
				<label for="confirm-input" class="text-xs text-muted-foreground">
					{m.confirm_dialog_type_hint({ word: confirmWord })}
				</label>
				<Input
					id="confirm-input"
					bind:value={typed}
					autocomplete="off"
					autocapitalize="off"
					autocorrect="off"
					spellcheck={false}
					placeholder={confirmWord}
					class="font-mono"
				/>
			</div>

			<div class="mt-5 flex items-center justify-end gap-2">
				<Button variant="ghost" size="sm" onclick={handleCancel} disabled={busy}>
					{cancelLabel ?? m.confirm_dialog_cancel()}
				</Button>
				<Button variant="destructive" size="sm" onclick={handleConfirm} disabled={!matched || busy}>
					{busy ? m.confirm_dialog_busy() : (confirmLabel ?? m.confirm_dialog_confirm())}
				</Button>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
