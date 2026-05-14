<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import CheckCircle2 from '@lucide/svelte/icons/circle-check'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
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
	import { api } from '$lib/api'
	import { auth } from '$lib/stores/auth.svelte'
	import { toast } from 'svelte-sonner'
	import type { RepoGroup, SubmitSuccess } from '$lib/types'

	let groups = $state<RepoGroup[] | null>(null)
	let loading = $state(true)
	let selectedUrl = $state('')
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
		await loadRepos()
	})

	async function loadRepos() {
		loading = true
		try {
			const data = await api.get<{ groups: RepoGroup[] }>('/api/submit/repos')
			groups = data.groups
		} catch {
			groups = []
		} finally {
			loading = false
		}
	}

	const allRepos = $derived(groups?.flatMap((g) => g.repos) ?? [])
	const selectedRepo = $derived(allRepos.find((r) => r.url === selectedUrl) ?? null)

	$effect(() => {
		if (selectedRepo && !name) {
			name = humanize(selectedRepo.name)
		}
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
			const result = await api.post<SubmitSuccess>('/api/submit/oauth', {
				repoUrl: selectedRepo.url,
				name,
				description,
			})
			success = result
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
			<h1 class="text-3xl font-semibold tracking-tight">Plugin registered</h1>
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
					<CardDescription>
						We couldn't install the webhook automatically. Add it manually with this secret:
					</CardDescription>
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
			<Button href={`/plugins/${success.slug}`}>View plugin</Button>
			<Button variant="outline" onclick={() => (success = null)}>Submit another</Button>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-2xl px-6 py-12 space-y-8">
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">Submit a plugin</h1>
			<p class="text-muted-foreground">
				Pick a repo you own on a configured provider instance and Pluggr will install the release webhook for you.
			</p>
		</header>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Your repos</CardTitle>
				<CardDescription>Across all linked identities.</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				{#if loading}
					<p class="text-sm text-muted-foreground">Loading repos…</p>
				{:else if !groups || groups.length === 0}
					<p class="text-sm text-muted-foreground">
						No linked identities yet. <a href="/settings" class="text-primary hover:underline">Link one in settings</a>.
					</p>
				{:else}
					{#each groups as g (g.identityId)}
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<div class="text-sm font-medium">{g.providerDisplayName} · {g.username}</div>
								<Button variant="ghost" size="sm" href={g.reauthUrl}>
									<RefreshCw class="h-3 w-3" />
									Re-authorize
								</Button>
							</div>
							{#if g.error}
								<p class="text-xs text-destructive">{g.error}</p>
							{:else if g.repos.length === 0}
								<p class="text-xs text-muted-foreground">No writable repos on this account.</p>
							{:else}
								<Select bind:value={selectedUrl}>
									<option value="" disabled>Pick a repo…</option>
									{#each g.repos as r (r.url)}
										<option value={r.url}>{r.fullName}{r.isPrivate ? ' (private)' : ''}</option>
									{/each}
								</Select>
							{/if}
						</div>
					{/each}
				{/if}
			</CardContent>
		</Card>

		{#if selectedRepo}
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Plugin metadata</CardTitle>
					<CardDescription>
						Repo: <a href={selectedRepo.url} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline">
							{selectedRepo.fullName}<ExternalLink class="h-3 w-3" />
						</a>
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onsubmit={submit} class="space-y-4">
						<div class="space-y-2">
							<Label for="name">Display name</Label>
							<Input id="name" bind:value={name} required maxlength={80} />
						</div>
						<div class="space-y-2">
							<Label for="desc">Description</Label>
							<Textarea id="desc" bind:value={description} required minlength={10} maxlength={300} rows={3} />
						</div>
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Submitting…' : 'Submit plugin'}
						</Button>
					</form>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
