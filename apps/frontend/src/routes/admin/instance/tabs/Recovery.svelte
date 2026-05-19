<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import StickySaveBar from '$components/admin/StickySaveBar.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	let persist = $state(false)
	let initialPersist = $state(false)
	let hasCredentials = $state(false)
	let currentEmail = $state<string | null>(null)
	let newEmail = $state('')
	let newPassword = $state('')
	let loading = $state(true)
	let saving = $state(false)

	const dirty = $derived(persist !== initialPersist)
	const canRotate = $derived(newEmail.trim().length > 0 && newPassword.length >= 8)

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.auth['email-recovery'].get()
			if (error) throw new Error(extractError(error))
			const r = data as { persist: boolean; hasCredentials: boolean; email: string | null }
			persist = r.persist
			initialPersist = r.persist
			hasCredentials = r.hasCredentials
			currentEmail = r.email
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_load_failed())
		} finally {
			loading = false
		}
	}

	async function save(opts: { rotate?: boolean } = {}) {
		saving = true
		try {
			const body: { persist?: boolean; email?: string; password?: string } = { persist }
			if (opts.rotate) {
				if (!canRotate) {
					toast.error(m.admin_recovery_field_validation())
					return
				}
				body.email = newEmail.trim()
				body.password = newPassword
			}
			const { error } = await eden.api.admin.auth['email-recovery'].put(body)
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_recovery_saved())
			newEmail = ''
			newPassword = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_recovery_save_failed())
		} finally {
			saving = false
		}
	}

	async function remove() {
		if (!confirm(m.admin_recovery_delete_confirm())) return
		saving = true
		try {
			const { error } = await eden.api.admin.auth['email-recovery'].delete()
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_recovery_deleted())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_recovery_save_failed())
		} finally {
			saving = false
		}
	}

	function discard() {
		persist = initialPersist
	}

	function onCredKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && canRotate) {
			e.preventDefault()
			save({ rotate: true })
		}
	}

	onMount(load)
</script>

<div class="space-y-6">
	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				{m.admin_recovery_card_title()}
				<Badge variant={persist ? 'default' : 'secondary'}>
					{persist ? m.admin_recovery_persist_on() : m.admin_recovery_persist_off()}
				</Badge>
			</CardTitle>
			<CardDescription>{m.admin_recovery_card_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else}
				<label class="flex items-center gap-3 cursor-pointer select-none">
					<input type="checkbox" bind:checked={persist} class="h-4 w-4 rounded border-input" />
					<span class="text-sm">{m.admin_recovery_persist_label()}</span>
				</label>
				<p class="text-xs text-muted-foreground">{m.admin_recovery_persist_hint()}</p>

				<div class="rounded-md border border-border bg-card/50 p-3 space-y-3">
					<div class="text-sm">
						{#if hasCredentials}
							<span class="text-muted-foreground">{m.admin_recovery_current_credential()}</span>
							<code class="font-mono">{currentEmail}</code>
						{:else}
							<span class="text-muted-foreground">{m.admin_recovery_no_credential()}</span>
						{/if}
					</div>
					<div class="grid gap-2 sm:grid-cols-2">
						<div class="grid gap-1">
							<Label for="recoveryEmail" class="text-xs">{m.admin_recovery_email_label()}</Label>
							<Input id="recoveryEmail" type="email" bind:value={newEmail} autocomplete="off" onkeydown={onCredKey} />
						</div>
						<div class="grid gap-1">
							<Label for="recoveryPassword" class="text-xs">{m.admin_recovery_password_label()}</Label>
							<Input
								id="recoveryPassword"
								type="password"
								bind:value={newPassword}
								autocomplete="new-password"
								onkeydown={onCredKey}
							/>
						</div>
					</div>
					<div class="flex flex-wrap gap-2 justify-end">
						{#if hasCredentials}
							<Button variant="ghost" size="sm" onclick={remove} disabled={saving}>
								{m.admin_recovery_delete_button()}
							</Button>
						{/if}
						<Button size="sm" variant="outline" onclick={() => save({ rotate: true })} disabled={saving || !canRotate}>
							<Save class="h-3.5 w-3.5" />
							{hasCredentials ? m.admin_recovery_rotate_button() : m.admin_recovery_set_button()}
						</Button>
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<StickySaveBar {dirty} {saving} onSave={() => save()} onDiscard={discard} />
