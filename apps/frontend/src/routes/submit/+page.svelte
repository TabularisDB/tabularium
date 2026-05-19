<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import CheckCircle2 from '@lucide/svelte/icons/circle-check'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import Search from '@lucide/svelte/icons/search'
	import Lock from '@lucide/svelte/icons/lock'
	import Globe from '@lucide/svelte/icons/globe'
	import FileWarning from '@lucide/svelte/icons/file-warning'
	import FileCheck from '@lucide/svelte/icons/file-check'
	import Image from '@lucide/svelte/icons/image'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
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

	type ManifestPreview = {
		name: string | null
		description: string | null
		category: string | null
		kind: string | null
		tags: string[]
		license: string | null
		icon: string | null
		screenshots: Array<{ url: string; caption: string | null; alt: string | null }>
		homepage: string | null
		documentationUrl: string | null
		minRuntimeVersion: string | null
		source: string
		readmeLocales: string[]
	}

	type PreviewResult =
		| {
				ok: true
				slug: string
				slugTaken: boolean
				fromManifest: true
				version: string
				preview: ManifestPreview
		  }
		| {
				ok: true
				slug: string
				slugTaken: boolean
				fromManifest: false
				suggestedName: string
				message: string
				validationErrors?: unknown[]
		  }
		| { ok: false; error: string }

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
	let preview = $state<PreviewResult | null>(null)
	let previewing = $state(false)

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

	const selectedRepo = $derived<SubmittableRepo | null>(selectedGroup?.repos.find((r) => r.url === selectedUrl) ?? null)

	$effect(() => {
		// reset repo selection when switching identities
		void selectedIdentityId
		selectedUrl = ''
		search = ''
	})

	$effect(() => {
		const repo = selectedRepo
		if (!repo) {
			preview = null
			previewing = false
			name = ''
			description = ''
			return
		}
		void loadPreview(repo.url)
	})

	async function loadPreview(repoUrl: string) {
		previewing = true
		preview = null
		try {
			const { data, error } = await eden.api.submit.preview.post({ repoUrl })
			if (error) {
				const errBody = (error.value ?? { error: 'Preview failed' }) as { error?: string }
				preview = { ok: false, error: errBody.error ?? 'Preview failed' }
				return
			}
			preview = data as PreviewResult
			// Pre-fill manual fields with manifest values (or suggested name) so the
			// form is ready if the user wants to override or if there's no manifest.
			if (preview.ok && preview.fromManifest) {
				name = preview.preview.name ?? humanize(selectedRepo?.name ?? '')
				description = preview.preview.description ?? ''
			} else if (preview.ok && !preview.fromManifest) {
				name = preview.suggestedName
				description = ''
			}
		} catch {
			preview = { ok: false, error: 'Preview failed' }
		} finally {
			previewing = false
		}
	}

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
			const usingManifest = preview?.ok && preview.fromManifest
			const body = usingManifest ? { repoUrl: selectedRepo.url } : { repoUrl: selectedRepo.url, name, description }
			const { data, error } = await eden.api.submit.oauth.post(body)
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			success = data as SubmitSuccess
			toast.success(m.submit_success_title())
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
				<CardTitle class="text-base">{m.submit_success_slug_label()}</CardTitle>
				<CardDescription
					>{m.submit_success_slug_live_at()} <code class="font-mono">/plugins/{success.slug}</code></CardDescription
				>
			</CardHeader>
		</Card>

		{#if success.webhookInstalled}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">{m.submit_webhook_installed_title()}</CardTitle>
					<CardDescription>{m.submit_webhook_installed_body()}</CardDescription>
				</CardHeader>
			</Card>
		{:else}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">{m.submit_webhook_needed_title()}</CardTitle>
					<CardDescription>{m.submit_webhook_needed_body()}</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="space-y-1">
						<div class="text-xs uppercase tracking-wider text-muted-foreground">{m.submit_webhook_url_label()}</div>
						<CodeBlock value={success.webhookUrl} />
					</div>
					<div class="space-y-1">
						<div class="text-xs uppercase tracking-wider text-muted-foreground">{m.submit_webhook_secret_label()}</div>
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
													<ProviderIcon kind={selectedGroup.providerKind} baseUrl="" logoUrl={null} class="h-4 w-4" />
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
					<CardContent class="space-y-4">
						{#if previewing}
							<div class="space-y-3">
								<Skeleton class="h-5 w-1/2 rounded" />
								<Skeleton class="h-4 w-3/4 rounded" />
								<Skeleton class="h-4 w-2/3 rounded" />
							</div>
						{:else if preview && !preview.ok}
							<div
								class="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm"
							>
								<FileWarning class="h-4 w-4 text-destructive mt-0.5 shrink-0" />
								<div>
									<div class="font-medium text-destructive">{m.submit_preview_failed_title()}</div>
									<div class="text-xs text-muted-foreground mt-1">{preview.error}</div>
								</div>
							</div>
						{:else if preview?.ok && preview.fromManifest}
							<div class="rounded-md border border-primary/30 bg-primary/[0.04] px-4 py-3 space-y-3">
								<div class="flex items-start gap-3">
									<FileCheck class="h-4 w-4 text-primary mt-0.5 shrink-0" />
									<div class="flex-1 min-w-0">
										<div class="text-xs uppercase tracking-wider text-primary/80">
											{m.submit_preview_from_manifest({ version: preview.version })}
										</div>
										<div class="mt-1 text-base font-semibold truncate">
											{preview.preview.name ?? humanize(selectedRepo.name)}
										</div>
										{#if preview.preview.description}
											<p class="text-sm text-muted-foreground mt-1">{preview.preview.description}</p>
										{/if}
									</div>
								</div>
								<div class="flex flex-wrap gap-1.5 pl-7">
									{#if preview.preview.kind}
										<Badge variant="default" class="text-[10px]">{preview.preview.kind}</Badge>
									{/if}
									{#if preview.preview.category}
										<Badge variant="outline" class="text-[10px]">{preview.preview.category}</Badge>
									{/if}
									{#if preview.preview.license}
										<Badge variant="outline" class="text-[10px]">{preview.preview.license}</Badge>
									{/if}
									{#each preview.preview.tags.slice(0, 6) as t (t)}
										<Badge variant="outline" class="text-[10px]">#{t}</Badge>
									{/each}
									{#if preview.preview.tags.length > 6}
										<Badge variant="outline" class="text-[10px]">+{preview.preview.tags.length - 6}</Badge>
									{/if}
								</div>
								<div class="flex flex-wrap gap-3 pl-7 text-[11px] text-muted-foreground">
									{#if preview.preview.screenshots.length > 0}
										<span class="inline-flex items-center gap-1">
											<Image class="h-3 w-3" />
											{m.submit_preview_screenshots({ count: preview.preview.screenshots.length })}
										</span>
									{/if}
									{#if preview.preview.readmeLocales.length > 0}
										<span>{m.submit_preview_readme_locales({ locales: preview.preview.readmeLocales.join(', ') })}</span
										>
									{/if}
									{#if preview.preview.minRuntimeVersion}
										<span>runtime ≥ {preview.preview.minRuntimeVersion}</span>
									{/if}
								</div>
							</div>
						{:else if preview?.ok && !preview.fromManifest}
							<div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm space-y-2">
								<div class="flex items-start gap-3">
									<FileWarning class="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
									<div class="flex-1">
										<div class="font-medium">{m.submit_preview_no_manifest_title()}</div>
										<div class="text-xs text-muted-foreground mt-1">{preview.message}</div>
									</div>
								</div>
								{#if preview.validationErrors && preview.validationErrors.length > 0}
									<details class="text-xs">
										<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
											{m.submit_preview_validation_errors({ count: preview.validationErrors.length })}
										</summary>
										<pre
											class="mt-2 rounded bg-card/60 p-2 font-mono text-[11px] whitespace-pre-wrap break-words">{JSON.stringify(
												preview.validationErrors,
												null,
												2,
											)}</pre>
									</details>
								{/if}
							</div>
						{/if}

						{#if preview?.ok && preview.slugTaken}
							<div class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
								{m.submit_slug_taken({ slug: preview.slug })}
							</div>
						{/if}

						<form onsubmit={submit} class="space-y-4">
							{#if preview?.ok && !preview.fromManifest}
								<div class="space-y-2">
									<Label for="name">{m.submit_display_name()}</Label>
									<Input id="name" bind:value={name} required maxlength={80} />
								</div>
								<div class="space-y-2">
									<Label for="desc">{m.submit_description()}</Label>
									<Textarea id="desc" bind:value={description} required minlength={10} maxlength={300} rows={3} />
								</div>
							{/if}
							<Button type="submit" disabled={submitting || previewing || (preview?.ok && preview.slugTaken)}>
								{submitting ? m.submit_submitting() : m.submit_button()}
							</Button>
						</form>
					</CardContent>
				</Card>
			{/if}
		{/if}
	</div>
{/if}
