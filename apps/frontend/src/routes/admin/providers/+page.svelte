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
	import { eden } from '$lib/eden'
	import { toast } from 'svelte-sonner'
	import type { ProviderInstanceAdmin, ProviderKind } from '$lib/types'

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
			toast.success(`${newDisplayName} added`)
			newId = ''
			newDisplayName = ''
			newClientId = ''
			newClientSecret = ''
			newLogoUrl = ''
			await load()
		} catch (e) {
			formError = e instanceof Error ? e.message : 'Create failed'
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
			toast.error(e instanceof Error ? e.message : 'Update failed')
		}
	}

	async function deleteInstance(inst: ProviderInstanceAdmin) {
		if (!confirm(`Delete provider instance '${inst.id}'?`)) return
		try {
			const { error } = await eden.api.admin['provider-instances']({ id: inst.id }).delete()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Deleted')
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Delete failed')
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
			toast.success('Logo uploaded')
			input.value = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Upload failed')
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Provider instances</h1>
	<p class="text-sm text-muted-foreground">Configure OAuth clients. End users sign in with any enabled instance.</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Configured instances</CardTitle>
		<CardDescription>One row per OAuth client. Disable to hide from the login page without losing the credentials.</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3">
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if instances.length === 0}
			<p class="text-sm text-muted-foreground">No instances yet. Add your first one below.</p>
		{:else}
			{#each instances as inst (inst.id)}
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3">
					<div class="flex items-center gap-3 min-w-0">
						<ProviderIcon kind={inst.kind} baseUrl={inst.baseUrl} logoUrl={inst.logoUrl} class="h-5 w-5 flex-shrink-0" />
						<div class="space-y-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-medium">{inst.displayName}</span>
								<Badge variant={inst.enabled ? 'default' : 'secondary'}>{inst.enabled ? 'enabled' : 'disabled'}</Badge>
								<Badge variant="outline">{inst.kind}</Badge>
							</div>
							<div class="text-xs text-muted-foreground font-mono truncate">{inst.id} · {inst.baseUrl}</div>
						</div>
					</div>
					<div class="flex items-center gap-2 flex-shrink-0">
						<label class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
							Upload logo
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp,image/svg+xml"
								class="hidden"
								onchange={(e) => uploadLogo(inst, e.currentTarget)}
							/>
						</label>
						<Button variant="ghost" size="sm" onclick={() => toggleInstance(inst)}>
							{inst.enabled ? 'Disable' : 'Enable'}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => deleteInstance(inst)}>
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
		<CardTitle class="text-base">Add a provider instance</CardTitle>
		<CardDescription>
			Register OAuth client credentials. The callback URL to enter on the provider side is
			<code class="font-mono">{`${typeof window !== 'undefined' ? window.location.origin : ''}/auth/<id>/callback`}</code>.
		</CardDescription>
	</CardHeader>
	<CardContent>
		<form onsubmit={createInstance} class="space-y-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for="instId">Instance ID (slug)</Label>
					<Input id="instId" bind:value={newId} placeholder="forgejo-acme" pattern="[a-z0-9][a-z0-9-]*" required />
					<p class="text-xs text-muted-foreground">Lowercase, hyphens. Becomes the OAuth route.</p>
				</div>
				<div class="space-y-2">
					<Label for="instKind">Kind</Label>
					<Select bind:value={newKind}>
						<option value="github">GitHub (github.com or GHES)</option>
						<option value="gitlab">GitLab (gitlab.com or self-hosted)</option>
						<option value="gitea">Gitea / Forgejo (Codeberg or self-hosted)</option>
					</Select>
				</div>
				<div class="space-y-2">
					<Label for="instName">Display name</Label>
					<Input id="instName" bind:value={newDisplayName} placeholder="ACME Forgejo" required />
				</div>
				<div class="space-y-2">
					<Label for="instBase">Base URL</Label>
					<Input id="instBase" bind:value={newBaseUrl} required />
				</div>
				<div class="space-y-2">
					<Label for="instClientId">OAuth client ID</Label>
					<Input id="instClientId" bind:value={newClientId} required />
				</div>
				<div class="space-y-2">
					<Label for="instClientSecret">OAuth client secret</Label>
					<Input id="instClientSecret" type="password" bind:value={newClientSecret} required />
				</div>
				<div class="space-y-2 sm:col-span-2">
					<Label for="instLogo">Logo URL (optional)</Label>
					<Input id="instLogo" type="url" bind:value={newLogoUrl} placeholder="https://example.com/logo.svg" />
					<p class="text-xs text-muted-foreground">Defaults to the simpleicons CDN brand mark.</p>
				</div>
			</div>
			{#if formError}
				<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{formError}
				</div>
			{/if}
			<Button type="submit" disabled={creating}>
				<Plus class="h-4 w-4" />
				{creating ? 'Adding…' : 'Add instance'}
			</Button>
		</form>
	</CardContent>
</Card>
