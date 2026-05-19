<script lang="ts">
	import { onMount } from 'svelte'
	import ArrowUp from '@lucide/svelte/icons/arrow-up'
	import Plus from '@lucide/svelte/icons/plus'
	import Hammer from '@lucide/svelte/icons/hammer'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'
	import CmsPage from '$components/CmsPage.svelte'
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'
	import { toast } from 'svelte-sonner'
	import type { PluginRequest, PageRendered } from '$lib/types'

	let requests = $state<PluginRequest[]>([])
	let deleteTarget = $state<PluginRequest | null>(null)
	let deleting = $state(false)
	let loading = $state(true)
	let creating = $state(false)
	let slug = $state('')
	let name = $state('')
	let description = $state('')
	let requestsEnabled = $state(true)

	let cmsOverride = $state<PageRendered | null>(null)
	let cmsChecked = $state(false)

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.requests.get({ query: { sort: 'upvotes', limit: '100' } })
			if (error) throw error
			requests = (data as { requests: PluginRequest[] }).requests
		} catch {
			requests = []
		} finally {
			loading = false
		}
	}

	onMount(async () => {
		const featuresRes = await eden.api.features.get()
		if (featuresRes.data) requestsEnabled = (featuresRes.data as { requestsEnabled: boolean }).requestsEnabled
		try {
			const { data, error } = await eden.api.pages['by-path'].get({
				query: { path: '/requests', locale: i18n.current },
			})
			if (error) throw error
			cmsOverride = data as PageRendered
			cmsChecked = true
			return
		} catch {
			cmsChecked = true
		}
		await load()
	})

	async function vote(req: PluginRequest) {
		if (!auth.user) {
			toast.error('Sign in to upvote')
			return
		}
		try {
			const { data, error } = await eden.api.requests({ id: req.id }).upvote.post({})
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			const result = data as { upvotes: number; voted: boolean }
			requests = requests.map((r) => (r.id === req.id ? { ...r, upvotes: result.upvotes } : r))
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Upvote failed')
		}
	}

	async function claim(req: PluginRequest) {
		if (!auth.user) {
			toast.error(m.requests_sign_in_to_claim())
			return
		}
		const prev = { claims: req.claims, claimedByMe: req.claimedByMe }
		const optimisticClaimed = !req.claimedByMe
		const optimisticCount = req.claims + (optimisticClaimed ? 1 : -1)
		requests = requests.map((r) =>
			r.id === req.id ? { ...r, claimedByMe: optimisticClaimed, claims: optimisticCount } : r,
		)
		try {
			const { data, error } = await eden.api.requests({ id: req.id }).claim.post({})
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			const result = data as { claimed: boolean; claims: number }
			requests = requests.map((r) =>
				r.id === req.id ? { ...r, claimedByMe: result.claimed, claims: result.claims } : r,
			)
		} catch (e) {
			requests = requests.map((r) =>
				r.id === req.id ? { ...r, claims: prev.claims, claimedByMe: prev.claimedByMe } : r,
			)
			toast.error(e instanceof Error ? e.message : 'Claim failed')
		}
	}

	function openDeleteRequest(req: PluginRequest) {
		if (!auth.isAdmin) return
		deleteTarget = req
	}

	async function confirmDeleteRequest() {
		const req = deleteTarget
		if (!req) return
		deleting = true
		try {
			const { error } = await eden.api.admin.requests({ id: req.id }).delete()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			requests = requests.filter((r) => r.id !== req.id)
			deleteTarget = null
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Delete failed')
		} finally {
			deleting = false
		}
	}

	async function createRequest(e: SubmitEvent) {
		e.preventDefault()
		if (!auth.user) {
			toast.error('Sign in to create a request')
			return
		}
		creating = true
		try {
			const { error } = await eden.api.requests.post({ slug, name, description })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			slug = ''
			name = ''
			description = ''
			await load()
			toast.success('Request created')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to create request')
		} finally {
			creating = false
		}
	}
</script>

{#if !cmsChecked}
	<div class="mx-auto max-w-4xl px-6 py-12">
		<p class="text-sm text-muted-foreground">Loading…</p>
	</div>
{:else if cmsOverride}
	<div class="mx-auto max-w-4xl px-6 py-12 space-y-6">
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">{cmsOverride.title}</h1>
		</header>
		<CmsPage html={cmsOverride.html} />
	</div>
{:else}
	<div class="mx-auto max-w-4xl px-6 py-12 space-y-10">
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">{m.requests_title()}</h1>
			<p class="text-muted-foreground">{m.requests_subtitle()}</p>
		</header>

		{#if requestsEnabled}
			<Card>
				<CardContent class="pt-6">
					<form onsubmit={createRequest} class="space-y-4">
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="slug">{m.requests_slug()}</Label>
								<Input id="slug" bind:value={slug} placeholder="awesome-plugin" pattern="[a-z0-9-]+" required />
							</div>
							<div class="space-y-2">
								<Label for="name">{m.requests_name()}</Label>
								<Input id="name" bind:value={name} placeholder="Awesome Plugin" required />
							</div>
						</div>
						<div class="space-y-2">
							<Label for="desc">{m.requests_description()}</Label>
							<Textarea
								id="desc"
								bind:value={description}
								placeholder="What should this plugin do?"
								rows={3}
								required
							/>
						</div>
						<Button type="submit" disabled={creating || !auth.user}>
							<Plus class="h-4 w-4" />
							{creating ? m.requests_creating() : auth.user ? m.requests_create() : m.requests_sign_in_to_create()}
						</Button>
					</form>
				</CardContent>
			</Card>
		{:else}
			<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
				{m.requests_disabled()}
			</div>
		{/if}

		<section class="space-y-3">
			<h2 class="text-xl font-semibold tracking-tight">{m.requests_open()}</h2>
			{#if loading}
				{#each Array(4) as _}
					<Skeleton class="h-20 rounded-md" />
				{/each}
			{:else if requests.length === 0}
				<div class="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
					{m.requests_empty()}
				</div>
			{:else}
				{#each requests as r (r.id)}
					<Card>
						<CardContent class="flex items-center gap-4 p-4">
							<button
								type="button"
								onclick={() => vote(r)}
								class="flex flex-col items-center justify-center min-w-14 rounded-md border border-border bg-card-foreground/5 px-3 py-1.5 hover:border-primary/40 hover:bg-primary/5"
							>
								<ArrowUp class="h-4 w-4" />
								<span class="font-mono text-sm">{r.upvotes}</span>
							</button>
							<div class="flex-1 min-w-0 space-y-1">
								<div class="flex items-center gap-2">
									<h3 class="font-semibold tracking-tight">{r.name}</h3>
									<span class="font-mono text-xs text-muted-foreground">{r.slug}</span>
								</div>
								<p class="text-sm text-muted-foreground">{r.description}</p>
								{#if r.claims > 0}
									<p class="text-xs text-muted-foreground">{m.requests_claim_count({ count: r.claims })}</p>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<Button
									type="button"
									variant={r.claimedByMe ? 'default' : 'outline'}
									size="sm"
									onclick={() => claim(r)}
									disabled={!auth.user}
									title={auth.user ? undefined : m.requests_sign_in_to_claim()}
								>
									<Hammer class="h-4 w-4" />
									{r.claimedByMe ? m.requests_claimed() : m.requests_claim()}
								</Button>
								{#if auth.isAdmin}
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onclick={() => openDeleteRequest(r)}
										aria-label={m.requests_admin_delete_confirm()}
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								{/if}
							</div>
						</CardContent>
					</Card>
				{/each}
			{/if}
		</section>
	</div>
{/if}

{#if deleteTarget}
	<ConfirmDialog
		open={deleteTarget !== null}
		title={m.requests_admin_delete_confirm()}
		description={deleteTarget.slug}
		confirmWord="DELETE"
		busy={deleting}
		onConfirm={confirmDeleteRequest}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}
