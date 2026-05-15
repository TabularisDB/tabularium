<script lang="ts">
	import { onMount } from 'svelte'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
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

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin['provider-instances'].get()
			if (error) throw error
			instances = (data as { instances: ProviderInstanceAdmin[] }).instances
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
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
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
		try {
			const { error } = await eden.api.admin['provider-instances']({ id: inst.id }).patch({ enabled: !inst.enabled })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_providers_update_failed())
		}
	}

	async function deleteInstance(inst: ProviderInstanceAdmin) {
		if (!confirm(m.admin_providers_confirm_delete({ id: inst.id }))) return
		try {
			const { error } = await eden.api.admin['provider-instances']({ id: inst.id }).delete()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_providers_deleted())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_providers_delete_failed())
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
				const data = await res.json().catch(() => null) as { error?: string } | null
				throw new Error(data?.error ?? `Upload failed: ${res.status}`)
			}
			toast.success(m.admin_providers_logo_uploaded())
			input.value = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_providers_upload_failed())
		}
	}
</script>

<AdminPageHeader title={m.admin_providers_title()} subtitle={m.admin_providers_subtitle()}>
	{#snippet meta()}
		{#if !loading}
			<span class="inline-flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
				{instances.filter((i) => i.enabled).length} {m.admin_providers_enabled().toLowerCase()}
			</span>
			<span class="text-muted-foreground/60">·</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true"></span>
				{instances.filter((i) => !i.enabled).length} {m.admin_providers_disabled().toLowerCase()}
			</span>
		{/if}
	{/snippet}
</AdminPageHeader>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_providers_configured()}</CardTitle>
		<CardDescription>{m.admin_providers_configured_subtitle()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if instances.length === 0}
			<p class="text-sm text-muted-foreground">{m.admin_providers_empty()}</p>
		{:else}
			{#each instances as inst (inst.id)}
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3 transition-colors hover:border-border/80">
					<div class="flex items-center gap-3 min-w-0">
						<span
							class="h-2 w-2 rounded-full shrink-0 {inst.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'}"
							aria-hidden="true"
							title={inst.enabled ? m.admin_providers_enabled() : m.admin_providers_disabled()}
						></span>
						<ProviderIcon kind={inst.kind} baseUrl={inst.baseUrl} logoUrl={inst.logoUrl} class="h-5 w-5 flex-shrink-0" />
						<div class="space-y-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-medium">{inst.displayName}</span>
								<Badge variant="outline" class="text-[10px]">{inst.kind}</Badge>
							</div>
							<div class="text-xs text-muted-foreground font-mono truncate">{inst.id} · {inst.baseUrl}</div>
						</div>
					</div>
					<div class="flex items-center gap-2 flex-shrink-0">
						<label class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
							{m.admin_providers_upload_logo()}
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp,image/svg+xml"
								class="hidden"
								onchange={(e) => uploadLogo(inst, e.currentTarget)}
							/>
						</label>
						<Button variant="ghost" size="sm" onclick={() => toggleInstance(inst)}>
							{inst.enabled ? m.admin_providers_disable_btn() : m.admin_providers_enable()}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => deleteInstance(inst)} aria-label={m.common_remove()}>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_providers_add_title()}</CardTitle>
		<CardDescription>
			{m.admin_providers_add_subtitle_prefix()}
			<code class="font-mono">{`${typeof window !== 'undefined' ? window.location.origin : ''}/auth/<id>/callback`}</code>.
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
