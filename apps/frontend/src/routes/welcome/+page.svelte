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
	import { m } from '$lib/paraglide/messages'

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
			toast.error(e instanceof Error ? e.message : m.welcome_branding_failed())
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
			toast.error(e instanceof Error ? e.message : m.welcome_provider_failed())
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
			toast.success(m.welcome_setup_complete())
			goto('/admin')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.welcome_finalize_failed())
			busy = false
		}
	}
</script>

{#if gated}
	<div class="mx-auto max-w-md px-6 py-20 text-center text-sm text-muted-foreground">{m.welcome_loading()}</div>
{:else}
	<div class="mx-auto max-w-2xl px-6 py-12 space-y-8">
		<div class="text-center space-y-2">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
				<Sparkles class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">{m.welcome_greeting({ name: auth.user?.displayName ?? '' })}</h1>
			<p class="text-muted-foreground">{m.welcome_intro_prefix()} <a href="/admin" class="text-primary hover:underline">{m.welcome_intro_link()}</a>{m.welcome_intro_suffix()}</p>
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
					<CardTitle class="text-base">{m.welcome_step1_title()}</CardTitle>
					<CardDescription>{m.welcome_step1_subtitle()}</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid gap-2">
						<Label for="brand-name">{m.welcome_field_name()}</Label>
						<Input id="brand-name" bind:value={brandName} maxlength={60} />
					</div>
					<div class="grid gap-2">
						<Label for="brand-tagline">{m.welcome_field_tagline()}</Label>
						<Input id="brand-tagline" bind:value={brandTagline} maxlength={200} />
					</div>
					<div class="grid gap-2 max-w-xs">
						<Label for="brand-primary">{m.welcome_field_primary()}</Label>
						<div class="flex gap-2 items-center">
							<input id="brand-primary" type="color" bind:value={brandPrimary} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
							<Input bind:value={brandPrimary} placeholder="#3b82f6" />
						</div>
					</div>
					<div class="flex justify-end">
						<Button onclick={saveBranding} disabled={busy || !brandName.trim()}>
							{m.welcome_continue()}
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</CardContent>
			</Card>
		{:else if step === 2}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">{m.welcome_step2_title()}</CardTitle>
					<CardDescription>{m.welcome_step2_subtitle()}</CardDescription>
				</CardHeader>
				<CardContent>
					<form onsubmit={saveProvider} class="space-y-4">
						<div class="grid grid-cols-2 gap-3">
							<div class="grid gap-2">
								<Label for="prov-id">{m.welcome_internal_id()}</Label>
								<Input id="prov-id" bind:value={provId} placeholder="github" required pattern="[a-z0-9-]+" />
							</div>
							<div class="grid gap-2">
								<Label for="prov-kind">{m.welcome_kind()}</Label>
								<Select id="prov-kind" bind:value={provKind}>
									<option value="github">GitHub</option>
									<option value="gitlab">GitLab</option>
									<option value="gitea">Gitea / Forgejo / Codeberg</option>
								</Select>
							</div>
						</div>
						<div class="grid gap-2">
							<Label for="prov-display">{m.welcome_display_name()}</Label>
							<Input id="prov-display" bind:value={provDisplayName} required />
						</div>
						<div class="grid gap-2">
							<Label for="prov-base">{m.welcome_base_url()}</Label>
							<Input id="prov-base" bind:value={provBaseUrl} required />
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="grid gap-2">
								<Label for="prov-cid">{m.welcome_client_id()}</Label>
								<Input id="prov-cid" bind:value={provClientId} required />
							</div>
							<div class="grid gap-2">
								<Label for="prov-secret">{m.welcome_client_secret()}</Label>
								<Input id="prov-secret" type="password" bind:value={provClientSecret} required />
							</div>
						</div>
						<div class="flex justify-between pt-2">
							<Button type="button" variant="ghost" onclick={skipProvider} disabled={busy}>{m.welcome_skip_for_now()}</Button>
							<Button type="submit" disabled={busy}>
								<Plus class="h-3.5 w-3.5" />
								{busy ? m.welcome_adding() : m.welcome_add_provider()}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		{:else}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">{m.welcome_step3_title()}</CardTitle>
					<CardDescription>
						{#if providerSkipped}
							{m.welcome_step3_skipped_prefix()} <a href="/admin/providers" class="text-primary hover:underline">{m.welcome_step3_skipped_link()}</a> {m.welcome_step3_skipped_suffix()}
						{:else}
							{m.welcome_step3_done()}
						{/if}
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3 text-sm">
					<ul class="space-y-2">
						<li class="flex items-center gap-2">
							<Check class="h-4 w-4 text-primary" />
							{m.welcome_branding_set_to()} <Badge variant="secondary">{branding.name}</Badge>
						</li>
						<li class="flex items-center gap-2">
							<Check class="h-4 w-4 text-primary" />
							{providerSkipped ? m.welcome_provider_skipped_summary() : m.welcome_provider_added_summary({ name: provDisplayName })}
						</li>
					</ul>
					<p class="text-xs text-muted-foreground pt-2">
						{m.welcome_next_steps_prefix()} <a href="/admin/infra" class="text-primary hover:underline">{m.welcome_next_steps_infra_link()}</a> {m.welcome_next_steps_middle()}
						<a href="/admin/branding" class="text-primary hover:underline">{m.welcome_next_steps_branding_link()}</a> {m.welcome_next_steps_suffix()}
					</p>
					<div class="flex justify-end pt-2">
						<Button onclick={finish} disabled={busy}>
							{busy ? m.welcome_finalizing() : m.welcome_open_admin()}
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
