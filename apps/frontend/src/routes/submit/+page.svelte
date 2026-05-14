<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import CheckCircle2 from '@lucide/svelte/icons/circle-check'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import Search from '@lucide/svelte/icons/search'
	import Lock from '@lucide/svelte/icons/lock'
	import Globe from '@lucide/svelte/icons/globe'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import CodeBlock from '$components/ui/CodeBlock.svelte'
	import Select from '$components/ui/Select.svelte'
	import ProviderIcon from '$components/brand/ProviderIcon.svelte'
	import { cn } from '$lib/utils'
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { toast } from 'svelte-sonner'
	import { m } from '$lib/paraglide/messages'
	import type { RepoGroup, SubmittableRepo, SubmitSuccess } from '$lib/types'

	let groups = $state<RepoGroup[] | null>(null)
	let loading = $state(true)
	let submissionsEnabled = $state(true)
	let selectedIdentityId = $state('')
	let selectedUrl = $state('')
	let search = $state('')
	let name = $state('')
	let description = $state('')
	let submitting = $state(false)
	let success = $state<SubmitSuccess | null>(null)

	onMount(async () => {
		await auth.refresh()
		if (!auth.user) {
			goto('/login')
			return
		}
		const featuresRes = await eden.api.features.get()
		if (featuresRes.data) submissionsEnabled = (featuresRes.data as { submissionsEnabled: boolean }).submissionsEnabled
		if (!submissionsEnabled) {
			loading = false
			return
		}
		await loadRepos()
	})

	async function loadRepos() {
		loading = true
		try {
			const { data, error } = await eden.api.submit.repos.get()
			if (error) throw error
			groups = (data as { groups: RepoGroup[] }).groups
			const firstUsable = groups.find((g) => !g.error && g.repos.length > 0)
			if (firstUsable) selectedIdentityId = firstUsable.identityId
		} catch {
			groups = []
		} finally {
			loading = false
		}
	}

	const selectedGroup = $derived(groups?.find((g) => g.identityId === selectedIdentityId) ?? null)

	const filteredRepos = $derived.by(() => {
		const repos = selectedGroup?.repos ?? []
		const q = search.trim().toLowerCase()
		if (!q) return repos
		return repos.filter((r) => r.fullName.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q))
	})

	const selectedRepo = $derived<SubmittableRepo | null>(
		selectedGroup?.repos.find((r) => r.url === selectedUrl) ?? null,
	)

	$effect(() => {
		// reset repo selection when switching identities
		void selectedIdentityId
		selectedUrl = ''
		search = ''
	})

	$effect(() => {
		if (selectedRepo && !name) name = humanize(selectedRepo.name)
	})

	function humanize(s: string) {
		return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		if (!selectedRepo) {
			toast.error('Pick a repo')
			return
		}
		submitting = true
		try {
			const { data, error } = await eden.api.submit.oauth.post({
				repoUrl: selectedRepo.url,
				name,
				description,
			})
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			success = data as SubmitSuccess
			toast.success('Plugin registered')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Submit failed')
		} finally {
			submitting = false
		}
	}
</script>

{#if success}
	<div class="mx-auto max-w-2xl px-6 py-12 space-y-6">
		<div class="flex items-center gap-3">
			<CheckCircle2 class="h-8 w-8 text-success" />
			<h1 class="text-3xl font-semibold tracking-tight">{m.submit_success_title()}</h1>
		</div>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Slug</CardTitle>
				<CardDescription>Your plugin is live at <code class="font-mono">/plugins/{success.slug}</code></CardDescription>
			</CardHeader>
		</Card>

		{#if success.webhookInstalled}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Webhook installed automatically</CardTitle>
					<CardDescription>Releases will appear here within seconds of being published.</CardDescription>
				</CardHeader>
			</Card>
		{:else}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Webhook setup needed</CardTitle>
					<CardDescription>We couldn't install the webhook automatically. Add it manually with this secret:</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="space-y-1">
						<div class="text-xs uppercase tracking-wider text-muted-foreground">Webhook URL</div>
						<CodeBlock value={success.webhookUrl} />
					</div>
					<div class="space-y-1">
						<div class="text-xs uppercase tracking-wider text-muted-foreground">Secret</div>
						<CodeBlock value={success.webhookSecret} />
					</div>
				</CardContent>
			</Card>
		{/if}

		<div class="flex gap-2">
			<Button href={`/plugins/${success.slug}`}>{m.submit_view_plugin()}</Button>
			<Button variant="outline" onclick={() => (success = null)}>{m.submit_another()}</Button>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-2xl px-6 py-12 space-y-8">
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">{m.submit_title()}</h1>
			<p class="text-muted-foreground">{m.submit_subtitle({ name: branding.name })}</p>
		</header>

		{#if !submissionsEnabled}
			<div class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
				{m.submit_disabled()}
			</div>
		{:else if loading}
			<p class="text-sm text-muted-foreground">{m.submit_loading_repos()}</p>
		{:else if !groups || groups.length === 0}
			<Card>
				<CardContent class="pt-6 text-sm text-muted-foreground">
					{m.submit_no_identities()}
				</CardContent>
			</Card>
		{:else}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">{m.submit_repository()}</CardTitle>
					<CardDescription>{m.submit_switch_identity_hint()}</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
						<div class="space-y-2">
							<Label for="identity">{m.submit_identity_label()}</Label>
							<Select id="identity" bind:value={selectedIdentityId}>
								{#each groups as g (g.identityId)}
									<option value={g.identityId} disabled={Boolean(g.error) || g.repos.length === 0}>
										{g.providerDisplayName} · {g.username}{g.error
											? ' (re-auth needed)'
											: g.repos.length === 0
												? ' (no repos)'
												: ` · ${g.repos.length} repo${g.repos.length === 1 ? '' : 's'}`}
									</option>
								{/each}
							</Select>
						</div>
						{#if selectedGroup}
							<Button variant="ghost" size="sm" href={selectedGroup.reauthUrl}>
								<RefreshCw class="h-3 w-3" />
								{m.submit_reauthorize()}
							</Button>
						{/if}
					</div>

					{#if selectedGroup?.error}
						<p class="text-xs text-destructive">{selectedGroup.error}</p>
					{:else if selectedGroup}
						<div class="space-y-2">
							<div class="relative">
								<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input bind:value={search} placeholder={m.submit_filter_placeholder()} class="pl-9" />
							</div>
							{#if filteredRepos.length === 0}
								<p class="text-xs text-muted-foreground">{m.submit_no_repos_match()}</p>
							{:else}
								<ul class="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
									{#each filteredRepos as r (r.url)}
										<li>
											<button
												type="button"
												onclick={() => (selectedUrl = r.url)}
												class={cn(
													'w-full flex items-start gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50',
													selectedUrl === r.url && 'bg-accent text-foreground',
												)}
											>
												<span class="mt-0.5 inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
													<ProviderIcon
														kind={selectedGroup.providerKind}
														baseUrl=""
														logoUrl={null}
														class="h-4 w-4"
													/>
												</span>
												<span class="flex-1 min-w-0">
													<span class="flex items-center gap-2">
														<span class="font-medium truncate">{r.fullName}</span>
														{#if r.isPrivate}
															<Lock class="h-3 w-3 text-muted-foreground" />
														{:else}
															<Globe class="h-3 w-3 text-muted-foreground" />
														{/if}
													</span>
													{#if r.description}
														<span class="block text-xs text-muted-foreground truncate">{r.description}</span>
													{/if}
												</span>
											</button>
										</li>
									{/each}
								</ul>
								<p class="text-xs text-muted-foreground">
									{m.submit_repos_shown({ shown: filteredRepos.length, total: selectedGroup.repos.length })}
								</p>
							{/if}
						</div>
					{/if}
				</CardContent>
			</Card>

			{#if selectedRepo}
				<Card>
					<CardHeader>
						<CardTitle class="text-base">{m.submit_metadata_title()}</CardTitle>
						<CardDescription>
							<a
								href={selectedRepo.url}
								target="_blank"
								rel="noreferrer"
								class="inline-flex items-center gap-1 text-primary hover:underline"
							>
								{selectedRepo.fullName}<ExternalLink class="h-3 w-3" />
							</a>
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onsubmit={submit} class="space-y-4">
							<div class="space-y-2">
								<Label for="name">{m.submit_display_name()}</Label>
								<Input id="name" bind:value={name} required maxlength={80} />
							</div>
							<div class="space-y-2">
								<Label for="desc">{m.submit_description()}</Label>
								<Textarea id="desc" bind:value={description} required minlength={10} maxlength={300} rows={3} />
							</div>
							<Button type="submit" disabled={submitting}>
								{submitting ? m.submit_submitting() : m.submit_button()}
							</Button>
						</form>
					</CardContent>
				</Card>
			{/if}
		{/if}
	</div>
{/if}
