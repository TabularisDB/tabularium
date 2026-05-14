<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { toast } from 'svelte-sonner'
	import Check from '@lucide/svelte/icons/check'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import Plus from '@lucide/svelte/icons/plus'
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding, type Branding } from '$lib/stores/branding.svelte'
	import type { ProviderKind } from '$lib/types'

	let step = $state<1 | 2 | 3>(1)
	let busy = $state(false)
	let gated = $state(true)

	let brandName = $state('Tabularium')
	let brandTagline = $state('Discover, submit, ship plugins.')
	let brandPrimary = $state('#3b82f6')

	let provId = $state('')
	let provKind = $state<ProviderKind>('github')
	let provDisplayName = $state('')
	let provBaseUrl = $state('https://github.com')
	let provClientId = $state('')
	let provClientSecret = $state('')
	let providerSkipped = $state(false)

	onMount(async () => {
		if (!auth.loaded) await auth.refresh()
		if (!auth.isAdmin) {
			goto('/login/admin')
			return
		}
		const { data, error } = await eden.api.init.status.get()
		if (error) throw error
		const status = data as { setupCompleted: boolean }
		if (status.setupCompleted) {
			goto('/admin')
			return
		}
		brandName = branding.name
		brandTagline = branding.tagline
		brandPrimary = branding.primaryHex
		gated = false
	})

	$effect(() => {
		if (provKind === 'github') provBaseUrl = 'https://github.com'
		if (provKind === 'gitlab') provBaseUrl = 'https://gitlab.com'
		if (provKind === 'gitea') provBaseUrl = 'https://codeberg.org'
	})

	async function saveBranding() {
		busy = true
		try {
			const { data, error } = await eden.api.admin.branding.put({
				name: brandName,
				tagline: brandTagline,
				primaryHex: brandPrimary,
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as { ok: boolean; branding: Branding }
			branding.set(res.branding)
			step = 2
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save branding')
		} finally {
			busy = false
		}
	}

	async function saveProvider(e: SubmitEvent) {
		e.preventDefault()
		busy = true
		try {
			const { error } = await eden.api.admin['provider-instances'].post({
				id: provId.trim(),
				kind: provKind,
				displayName: provDisplayName.trim(),
				baseUrl: provBaseUrl.trim(),
				clientId: provClientId.trim(),
				clientSecret: provClientSecret,
				logoUrl: null,
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			step = 3
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to add provider')
		} finally {
			busy = false
		}
	}

	function skipProvider() {
		providerSkipped = true
		step = 3
	}

	async function finish() {
		busy = true
		try {
			const { error } = await eden.api.admin.setup.complete.post({})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Setup complete!')
			goto('/admin')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to finalize setup')
			busy = false
		}
	}
</script>

{#if gated}
	<div class="mx-auto max-w-md px-6 py-20 text-center text-sm text-muted-foreground">Loading…</div>
{:else}
	<div class="mx-auto max-w-2xl px-6 py-12 space-y-8">
		<div class="text-center space-y-2">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
				<Sparkles class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">Welcome, {auth.user?.displayName}</h1>
			<p class="text-muted-foreground">Let's get your registry set up. You can change everything later in <a href="/admin" class="text-primary hover:underline">Admin</a>.</p>
		</div>

		<div class="flex items-center justify-center gap-2 text-sm">
			{#each [1, 2, 3] as n (n)}
				<div class="flex items-center gap-2">
					<div class={'h-7 w-7 rounded-full grid place-items-center text-xs font-semibold ' + (n < step ? 'bg-primary text-primary-foreground' : n === step ? 'bg-accent text-foreground border border-border' : 'bg-card text-muted-foreground border border-border')}>
						{#if n < step}<Check class="h-3.5 w-3.5" />{:else}{n}{/if}
					</div>
					{#if n < 3}
						<ChevronRight class="h-4 w-4 text-muted-foreground" />
					{/if}
				</div>
			{/each}
		</div>

		{#if step === 1}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Brand your instance</CardTitle>
					<CardDescription>Give your registry a name and an accent color. Settings apply instantly.</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid gap-2">
						<Label for="brand-name">Name</Label>
						<Input id="brand-name" bind:value={brandName} maxlength={60} />
					</div>
					<div class="grid gap-2">
						<Label for="brand-tagline">Tagline</Label>
						<Input id="brand-tagline" bind:value={brandTagline} maxlength={200} />
					</div>
					<div class="grid gap-2 max-w-xs">
						<Label for="brand-primary">Primary color</Label>
						<div class="flex gap-2 items-center">
							<input id="brand-primary" type="color" bind:value={brandPrimary} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
							<Input bind:value={brandPrimary} placeholder="#3b82f6" />
						</div>
					</div>
					<div class="flex justify-end">
						<Button onclick={saveBranding} disabled={busy || !brandName.trim()}>
							Continue
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</CardContent>
			</Card>
		{:else if step === 2}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Add your first OAuth provider</CardTitle>
					<CardDescription>Users need at least one provider to sign in. You can add more later. Skip to do it after — but submitting plugins will be disabled until at least one is configured.</CardDescription>
				</CardHeader>
				<CardContent>
					<form onsubmit={saveProvider} class="space-y-4">
						<div class="grid grid-cols-2 gap-3">
							<div class="grid gap-2">
								<Label for="prov-id">Internal ID</Label>
								<Input id="prov-id" bind:value={provId} placeholder="github" required pattern="[a-z0-9-]+" />
							</div>
							<div class="grid gap-2">
								<Label for="prov-kind">Kind</Label>
								<Select id="prov-kind" bind:value={provKind}>
									<option value="github">GitHub</option>
									<option value="gitlab">GitLab</option>
									<option value="gitea">Gitea / Forgejo / Codeberg</option>
								</Select>
							</div>
						</div>
						<div class="grid gap-2">
							<Label for="prov-display">Display name</Label>
							<Input id="prov-display" bind:value={provDisplayName} required />
						</div>
						<div class="grid gap-2">
							<Label for="prov-base">Base URL</Label>
							<Input id="prov-base" bind:value={provBaseUrl} required />
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="grid gap-2">
								<Label for="prov-cid">Client ID</Label>
								<Input id="prov-cid" bind:value={provClientId} required />
							</div>
							<div class="grid gap-2">
								<Label for="prov-secret">Client secret</Label>
								<Input id="prov-secret" type="password" bind:value={provClientSecret} required />
							</div>
						</div>
						<div class="flex justify-between pt-2">
							<Button type="button" variant="ghost" onclick={skipProvider} disabled={busy}>Skip for now</Button>
							<Button type="submit" disabled={busy}>
								<Plus class="h-3.5 w-3.5" />
								{busy ? 'Adding…' : 'Add provider'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		{:else}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Ready to go</CardTitle>
					<CardDescription>
						{#if providerSkipped}
							You skipped provider setup — head to <a href="/admin/providers" class="text-primary hover:underline">Admin → Providers</a> to add one before submitting plugins.
						{:else}
							Provider added. Users can now sign in and submit plugins.
						{/if}
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3 text-sm">
					<ul class="space-y-2">
						<li class="flex items-center gap-2">
							<Check class="h-4 w-4 text-primary" />
							Branding set to <Badge variant="secondary">{branding.name}</Badge>
						</li>
						<li class="flex items-center gap-2">
							<Check class="h-4 w-4 text-primary" />
							{providerSkipped ? 'Provider skipped' : `Provider added: ${provDisplayName}`}
						</li>
					</ul>
					<p class="text-xs text-muted-foreground pt-2">
						Next steps: visit <a href="/admin/infra" class="text-primary hover:underline">Infrastructure</a> to wire Redis if you plan to scale, and
						<a href="/admin/branding" class="text-primary hover:underline">Branding</a> for the logo upload.
					</p>
					<div class="flex justify-end pt-2">
						<Button onclick={finish} disabled={busy}>
							{busy ? 'Finalizing…' : 'Open admin panel'}
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
