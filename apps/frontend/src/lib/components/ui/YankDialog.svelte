<script lang="ts">
	import { AlertDialog } from 'bits-ui'
	import Ban from '@lucide/svelte/icons/ban'
	import Button from './Button.svelte'
	import Input from './Input.svelte'
	import Textarea from './Textarea.svelte'
	import { m } from '$lib/paraglide/messages'

	type Props = {
		open: boolean
		version: string
		busy?: boolean
		onConfirm: (reason: string | null) => void | Promise<void>
		onCancel?: () => void
	}

	let { open = $bindable(), version, busy = false, onConfirm, onCancel }: Props = $props()

	let typed = $state('')
	let reason = $state('')

	$effect(() => {
		if (!open) {
			typed = ''
			reason = ''
		}
	})

	const matched = $derived(typed.trim() === version)

	function handleCancel() {
		if (busy) return
		open = false
		onCancel?.()
	}

	async function handleConfirm() {
		if (!matched || busy) return
		await onConfirm(reason.trim() || null)
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<AlertDialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl focus:outline-none"
		>
			<div class="flex items-start gap-3">
				<span
					class="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive shrink-0"
				>
					<Ban class="h-5 w-5" />
				</span>
				<div class="flex-1 min-w-0">
					<AlertDialog.Title class="text-base font-semibold tracking-tight">
						{m.plugin_detail_yank_title({ version })}
					</AlertDialog.Title>
					<AlertDialog.Description class="text-sm text-muted-foreground mt-1.5">
						{m.plugin_detail_yank_description()}
					</AlertDialog.Description>
				</div>
			</div>

			<div class="mt-5 space-y-2">
				<label for="yank-reason" class="text-xs text-muted-foreground">
					{m.plugin_detail_yank_reason_prompt()}
				</label>
				<Textarea
					id="yank-reason"
					bind:value={reason}
					rows={3}
					maxlength={500}
					placeholder="e.g. accidentally published, no binaries"
					disabled={busy}
				/>
			</div>

			<div class="mt-4 space-y-2">
				<label for="yank-confirm" class="text-xs text-muted-foreground">
					{m.confirm_dialog_type_hint({ word: version })}
				</label>
				<Input
					id="yank-confirm"
					bind:value={typed}
					autocomplete="off"
					autocapitalize="off"
					autocorrect="off"
					spellcheck={false}
					placeholder={version}
					class="font-mono"
					disabled={busy}
				/>
			</div>

			<div class="mt-5 flex items-center justify-end gap-2">
				<Button variant="ghost" size="sm" onclick={handleCancel} disabled={busy}>
					{m.confirm_dialog_cancel()}
				</Button>
				<Button variant="destructive" size="sm" onclick={handleConfirm} disabled={!matched || busy}>
					{busy ? m.confirm_dialog_busy() : m.plugin_detail_yank_button()}
				</Button>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
