<script lang="ts">
	import { onMount } from 'svelte'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Check from '@lucide/svelte/icons/check'
	import X from '@lucide/svelte/icons/x'
	import Upload from '@lucide/svelte/icons/upload'
	import Power from '@lucide/svelte/icons/power'
	import PowerOff from '@lucide/svelte/icons/power-off'
	import Wifi from '@lucide/svelte/icons/wifi'
	import Loader2 from '@lucide/svelte/icons/loader-2'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import ProviderIcon from '$components/brand/ProviderIcon.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'
	import { eden } from '$lib/eden'
	import { toast } from 'svelte-sonner'
	import type { ProviderInstanceAdmin, ProviderKind } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	let instances = $state<ProviderInstanceAdmin[]>([])
	let loading = $state(true)

	let newId = $state('')
	let newKind = $state<ProviderKind>('github')
	let newDisplayName = $state('')
	let newBaseUrl = $state('https://github.com')
	let newClientId = $state('')
	let newClientSecret = $state('')
	let newLogoUrl = $state('')
	let creating = $state(false)
	let formError = $state<string | null>(null)

	let selected = $state<Set<string>>(new Set())
	let bulkBusy = $state(false)
	let testingId = $state<string | null>(null)
	let busy = $state<Record<string, boolean>>({})
	let deleteTarget = $state<ProviderInstanceAdmin | null>(null)

	// Status threshold: anything older than 30 days OR never used is treated as
	// "idle". Anything within the window is "healthy". 30d is the lowest value
	// that doesn't constantly flip during normal multi-week registry usage.
	const IDLE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000

	type PillTone = 'healthy' | 'idle' | 'disabled'

	function pillFor(inst: ProviderInstanceAdmin): { tone: PillTone; label: string } {
		if (!inst.enabled) return { tone: 'disabled', label: m.admin_providers_status_disabled() }
		const last = inst.lastUsedAt
		if (last !== null && Date.now() - last <= IDLE_THRESHOLD_MS) {
			return { tone: 'healthy', label: m.admin_providers_status_healthy() }
		}
		return { tone: 'idle', label: m.admin_providers_status_idle() }
	}

	const TONE_CLASSES: Record<PillTone, string> = {
		healthy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
		idle: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
		disabled: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
	}

	const TONE_DOT: Record<PillTone, string> = {
		healthy: 'bg-emerald-500',
		idle: 'bg-amber-500',
		disabled: 'bg-rose-500',
	}

	function formatRelative(ts: number): string {
		const diff = Date.now() - ts
		const minutes = Math.floor(diff / 60_000)
		if (minutes < 1) return 'just now'
		if (minutes < 60) return `${minutes}m ago`
		const hours = Math.floor(minutes / 60)
		if (hours < 24) return `${hours}h ago`
		const days = Math.floor(hours / 24)
		if (days < 30) return `${days}d ago`
		const months = Math.floor(days / 30)
		if (months < 12) return `${months}mo ago`
		const years = Math.floor(months / 12)
		return `${years}y ago`
	}

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin['provider-instances'].get()
			if (error) throw error
			instances = (data as { instances: ProviderInstanceAdmin[] }).instances
			// Drop any selections that no longer point at a known instance.
			selected = new Set([...selected].filter((id) => instances.some((i) => i.id === id)))
		} finally {
			loading = false
		}
	}

	onMount(load)

	function defaultBaseFor(kind: ProviderKind) {
		if (kind === 'github') return 'https://github.com'
		if (kind === 'gitlab') return 'https://gitlab.com'
		return 'https://codeberg.org'
	}

	$effect(() => {
		newBaseUrl = defaultBaseFor(newKind)
	})

	async function createInstance(e: SubmitEvent) {
		e.preventDefault()
		formError = null
		creating = true
		try {
			const { error } = await eden.api.admin['provider-instances'].post({
				id: newId,
				kind: newKind,
				displayName: newDisplayName,
				baseUrl: newBaseUrl,
				clientId: newClientId,
				clientSecret: newClientSecret,
				logoUrl: newLogoUrl.trim() ? newLogoUrl.trim() : null,
			})
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_providers_added({ name: newDisplayName }))
			newId = ''
			newDisplayName = ''
			newClientId = ''
			newClientSecret = ''
			newLogoUrl = ''
			await load()
		} catch (e) {
			formError = e instanceof Error ? e.message : m.admin_providers_create_failed()
		} finally {
			creating = false
		}
	}

	async function toggleInstance(inst: ProviderInstanceAdmin) {
		busy = { ...busy, [inst.id]: true }
		try {
			const { error } = await eden.api.admin['provider-instances']({ id: inst.id }).patch({ enabled: !inst.enabled })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_providers_update_failed())
		} finally {
			busy = { ...busy, [inst.id]: false }
		}
	}

	function openDeleteInstance(inst: ProviderInstanceAdmin) {
		deleteTarget = inst
	}

	async function confirmDeleteInstance() {
		const inst = deleteTarget
		if (!inst) return
		busy = { ...busy, [inst.id]: true }
		try {
			const { error } = await eden.api.admin['provider-instances']({ id: inst.id }).delete()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_providers_deleted())
			deleteTarget = null
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_providers_delete_failed())
		} finally {
			busy = { ...busy, [inst.id]: false }
		}
	}

	async function uploadLogo(inst: ProviderInstanceAdmin, input: HTMLInputElement) {
		const file = input.files?.[0]
		if (!file) return
		const form = new FormData()
		form.append('file', file)
		try {
			const res = await fetch(`/api/admin/provider-instances/${inst.id}/logo`, {
				method: 'POST',
				credentials: 'include',
				body: form,
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error ?? `Upload failed: ${res.status}`)
			}
			toast.success(m.admin_providers_logo_uploaded())
			input.value = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_providers_upload_failed())
		}
	}

	async function testOAuth(inst: ProviderInstanceAdmin) {
		testingId = inst.id
		try {
			const res = await fetch(`/api/admin/provider-instances/${inst.id}/test-oauth`, {
				method: 'POST',
				credentials: 'include',
			})
			const data = (await res.json().catch(() => null)) as { ok?: boolean; status?: number; error?: string } | null
			if (!res.ok || !data) {
				throw new Error(`Probe failed (${res.status})`)
			}
			if (data.ok) {
				toast.success(m.admin_providers_test_oauth_ok({ status: data.status ?? 0 }))
			} else {
				toast.error(
					m.admin_providers_test_oauth_failed({
						detail: data.error ?? `HTTP ${data.status ?? 'unknown'}`,
					}),
				)
			}
		} catch (e) {
			toast.error(m.admin_providers_test_oauth_failed({ detail: e instanceof Error ? e.message : 'unknown' }))
		} finally {
			testingId = null
		}
	}

	function toggleSelected(id: string, checked: boolean) {
		const next = new Set(selected)
		if (checked) next.add(id)
		else next.delete(id)
		selected = next
	}

	function toggleAll(checked: boolean) {
		selected = checked ? new Set(instances.map((i) => i.id)) : new Set()
	}

	async function bulk(action: 'enable' | 'disable') {
		if (selected.size === 0) return
		bulkBusy = true
		try {
			const res = await fetch('/api/admin/provider-instances/bulk', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [...selected], action }),
			})
			const data = (await res.json().catch(() => null)) as {
				ok: boolean
				action: string
				affected: number
				missing: string[]
				error?: string
			} | null
			if (!res.ok || !data?.ok) {
				throw new Error(data?.error ?? `Request failed (${res.status})`)
			}
			const baseMsg =
				action === 'enable'
					? m.admin_providers_bulk_enabled_toast({ count: data.affected })
					: m.admin_providers_bulk_disabled_toast({ count: data.affected })
			const extra = data.missing.length > 0 ? m.admin_providers_bulk_result_missing({ count: data.missing.length }) : ''
			toast.success(baseMsg + extra)
			selected = new Set()
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_providers_bulk_failed())
		} finally {
			bulkBusy = false
		}
	}
</script>

<AdminPageHeader title={m.admin_providers_title()} subtitle={m.admin_providers_subtitle()}>
	{#snippet meta()}
		{#if !loading}
			<span class="inline-flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
				{instances.filter((i) => i.enabled).length}
				{m.admin_providers_enabled().toLowerCase()}
			</span>
			<span class="text-muted-foreground/60">·</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true"></span>
				{instances.filter((i) => !i.enabled).length}
				{m.admin_providers_disabled().toLowerCase()}
			</span>
		{/if}
	{/snippet}
</AdminPageHeader>

{#if selected.size > 0}
	<div class="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
		<span class="text-sm">
			<strong class="text-foreground">{selected.size}</strong>
			{m.admin_providers_selected()}
		</span>
		<div class="flex items-center gap-1.5">
			<Button size="sm" variant="default" onclick={() => bulk('enable')} disabled={bulkBusy}>
				<Power class="h-3.5 w-3.5" />
				{m.admin_providers_bulk_enable_btn()}
			</Button>
			<Button size="sm" variant="outline" onclick={() => bulk('disable')} disabled={bulkBusy}>
				<PowerOff class="h-3.5 w-3.5" />
				{m.admin_providers_bulk_disable_btn()}
			</Button>
			<Button size="sm" variant="ghost" onclick={() => (selected = new Set())} disabled={bulkBusy}>
				{m.admin_providers_clear_selection()}
			</Button>
		</div>
	</div>
{/if}

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else if instances.length === 0}
	<Card>
		<CardContent class="py-8">
			<p class="text-sm text-muted-foreground text-center">{m.admin_providers_empty()}</p>
		</CardContent>
	</Card>
{:else}
	<div class="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
		<label class="flex items-center gap-2 cursor-pointer hover:text-foreground">
			<input
				type="checkbox"
				checked={selected.size === instances.length && instances.length > 0}
				indeterminate={selected.size > 0 && selected.size < instances.length}
				onchange={(e) => toggleAll(e.currentTarget.checked)}
				class="h-3.5 w-3.5 rounded border-input"
			/>
			<span>{m.admin_providers_select_all()}</span>
		</label>
		<span>
			{instances.length === 1
				? m.admin_providers_count_one({ count: instances.length })
				: m.admin_providers_count_other({ count: instances.length })}
		</span>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
		{#each instances as inst (inst.id)}
			{@const pill = pillFor(inst)}
			<div
				class="group relative flex flex-col rounded-lg border bg-card/50 transition-colors hover:border-border/80 {selected.has(
					inst.id,
				)
					? 'border-primary/40 ring-1 ring-primary/20'
					: 'border-border'}"
			>
				<div class="absolute top-3 left-3 z-10">
					<input
						type="checkbox"
						checked={selected.has(inst.id)}
						onchange={(e) => toggleSelected(inst.id, e.currentTarget.checked)}
						class="h-3.5 w-3.5 rounded border-input opacity-40 group-hover:opacity-100 transition-opacity {selected.has(
							inst.id,
						)
							? 'opacity-100'
							: ''}"
						aria-label={m.admin_providers_select_aria({ name: inst.displayName })}
					/>
				</div>

				<header class="flex items-start justify-between gap-3 p-4 pl-10">
					<div class="flex items-start gap-3 min-w-0">
						<ProviderIcon
							kind={inst.kind}
							baseUrl={inst.baseUrl}
							logoUrl={inst.logoUrl}
							class="h-6 w-6 flex-shrink-0 mt-0.5"
						/>
						<div class="min-w-0 space-y-1">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-medium truncate">{inst.displayName}</span>
								<Badge variant="outline" class="text-[10px]">{inst.kind}</Badge>
							</div>
						</div>
					</div>
					<span
						class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide {TONE_CLASSES[
							pill.tone
						]}"
					>
						<span class="h-1.5 w-1.5 rounded-full {TONE_DOT[pill.tone]}" aria-hidden="true"></span>
						{pill.label}
					</span>
				</header>

				<div class="px-4 pb-3 pl-10 space-y-1.5 text-xs">
					<div class="text-muted-foreground font-mono truncate" title={inst.baseUrl}>
						{inst.id} · {inst.baseUrl}
					</div>
					<div class="flex items-center gap-1.5">
						{#if inst.hasOAuthSecret}
							<Check class="h-3 w-3 text-emerald-500" />
							<span class="text-muted-foreground">
								{m.admin_providers_oauth_label()}:
								<span class="text-foreground">{m.admin_providers_oauth_configured()}</span>
							</span>
						{:else}
							<X class="h-3 w-3 text-rose-500" />
							<span class="text-muted-foreground">
								{m.admin_providers_oauth_label()}:
								<span class="text-rose-500">{m.admin_providers_oauth_missing()}</span>
							</span>
						{/if}
					</div>
					<div class="text-muted-foreground">
						{m.admin_providers_last_used_label()}:
						<span class="text-foreground">
							{inst.lastUsedAt ? formatRelative(inst.lastUsedAt) : m.admin_providers_never_used()}
						</span>
					</div>
				</div>

				<footer class="mt-auto flex items-center justify-end gap-1 border-t border-border/50 px-2 py-2">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => testOAuth(inst)}
						disabled={testingId === inst.id}
						title={m.admin_providers_test_oauth()}
						aria-label={m.admin_providers_test_oauth()}
					>
						{#if testingId === inst.id}
							<Loader2 class="h-3.5 w-3.5 animate-spin" />
						{:else}
							<Wifi class="h-3.5 w-3.5" />
						{/if}
						<span class="hidden sm:inline">
							{testingId === inst.id ? m.admin_providers_test_oauth_pending() : m.admin_providers_test_oauth()}
						</span>
					</Button>
					<label
						class="inline-flex items-center gap-1 px-2 h-8 rounded-md text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground"
						title={m.admin_providers_upload_logo()}
					>
						<Upload class="h-3.5 w-3.5" />
						<span class="sr-only">{m.admin_providers_upload_logo()}</span>
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp,image/svg+xml"
							class="hidden"
							onchange={(e) => uploadLogo(inst, e.currentTarget)}
						/>
					</label>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => toggleInstance(inst)}
						disabled={busy[inst.id]}
						title={inst.enabled ? m.admin_providers_disable_btn() : m.admin_providers_enable()}
					>
						{#if inst.enabled}
							<PowerOff class="h-3.5 w-3.5" />
						{:else}
							<Power class="h-3.5 w-3.5" />
						{/if}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => openDeleteInstance(inst)}
						disabled={busy[inst.id]}
						aria-label={m.common_remove()}
						title={m.common_remove()}
					>
						<Trash2 class="h-3.5 w-3.5" />
					</Button>
				</footer>
			</div>
		{/each}
	</div>
{/if}

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_providers_add_title()}</CardTitle>
		<CardDescription>
			{m.admin_providers_add_subtitle_prefix()}
			<code class="font-mono"
				>{`${typeof window !== 'undefined' ? window.location.origin : ''}/auth/<id>/callback`}</code
			>.
		</CardDescription>
	</CardHeader>
	<CardContent>
		<form onsubmit={createInstance} class="space-y-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for="instId">{m.admin_providers_instance_id()}</Label>
					<Input id="instId" bind:value={newId} placeholder="forgejo-acme" pattern="[a-z0-9][a-z0-9-]*" required />
					<p class="text-xs text-muted-foreground">{m.admin_providers_instance_id_note()}</p>
				</div>
				<div class="space-y-2">
					<Label for="instKind">{m.admin_providers_kind()}</Label>
					<Select bind:value={newKind}>
						<option value="github">GitHub (github.com or GHES)</option>
						<option value="gitlab">GitLab (gitlab.com or self-hosted)</option>
						<option value="gitea">Gitea / Forgejo (Codeberg or self-hosted)</option>
					</Select>
				</div>
				<div class="space-y-2">
					<Label for="instName">{m.admin_providers_display_name()}</Label>
					<Input id="instName" bind:value={newDisplayName} placeholder="ACME Forgejo" required />
				</div>
				<div class="space-y-2">
					<Label for="instBase">{m.admin_providers_base_url()}</Label>
					<Input id="instBase" bind:value={newBaseUrl} required />
				</div>
				<div class="space-y-2">
					<Label for="instClientId">{m.admin_providers_client_id()}</Label>
					<Input id="instClientId" bind:value={newClientId} required />
				</div>
				<div class="space-y-2">
					<Label for="instClientSecret">{m.admin_providers_client_secret()}</Label>
					<Input id="instClientSecret" type="password" bind:value={newClientSecret} required />
				</div>
				<div class="space-y-2 sm:col-span-2">
					<Label for="instLogo">{m.admin_providers_logo_url()}</Label>
					<Input id="instLogo" type="url" bind:value={newLogoUrl} placeholder="https://example.com/logo.svg" />
					<p class="text-xs text-muted-foreground">{m.admin_providers_logo_note()}</p>
				</div>
			</div>
			{#if formError}
				<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{formError}
				</div>
			{/if}
			<Button type="submit" size="sm" disabled={creating}>
				<Plus class="h-3.5 w-3.5" />
				{creating ? m.admin_providers_adding() : m.admin_providers_add_instance()}
			</Button>
		</form>
	</CardContent>
</Card>

{#if deleteTarget}
	<ConfirmDialog
		open={deleteTarget !== null}
		title={m.common_remove()}
		description={m.admin_providers_confirm_delete({ id: deleteTarget.id })}
		confirmWord={deleteTarget.id}
		confirmLabel={m.common_remove()}
		busy={busy[deleteTarget.id] ?? false}
		onConfirm={confirmDeleteInstance}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}
