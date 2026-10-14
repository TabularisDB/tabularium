<script lang="ts">
	import { onMount } from 'svelte'
	import ArrowUp from '@lucide/svelte/icons/arrow-up'
	import Plus from '@lucide/svelte/icons/plus'
	import Hammer from '@lucide/svelte/icons/hammer'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Lightbulb from '@lucide/svelte/icons/lightbulb'
	import LogIn from '@lucide/svelte/icons/log-in'
	import Flame from '@lucide/svelte/icons/flame'
	import Clock from '@lucide/svelte/icons/clock'
	import PackageCheck from '@lucide/svelte/icons/package-check'
	import GitBranch from '@lucide/svelte/icons/git-branch'
	import ScaffoldDialog from '$components/requests/ScaffoldDialog.svelte'
	import Badge from '$components/ui/Badge.svelte'
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
	import { cn } from '$lib/utils'
	import type { Kind, PluginRequest, PageRendered, RequestClaimer } from '$lib/types'

	const DESCRIPTION_MAX = 2000

	let requests = $state<PluginRequest[]>([])
	let deleteTarget = $state<PluginRequest | null>(null)
	let deleting = $state(false)
	let loading = $state(true)
	let creating = $state(false)
	let name = $state('')
	let description = $state('')
	let kind = $state('')
	let requestsEnabled = $state(true)
	let kinds = $state<Kind[]>([])
	let filterKind = $state('')
	let sort = $state<'upvotes' | 'recent'>('upvotes')
	let total = $state(0)
	let scaffoldTarget = $state<PluginRequest | null>(null)

	// Kinds @tabularis/create-plugin can scaffold a repository for.
	const SCAFFOLD_KINDS = new Set(['driver', 'theme'])

	// Claimable requests first (open, then already in progress), then shipped
	// and rejected. The API order (top or new) is kept within each group.
	function statusRank(r: PluginRequest): number {
		if (r.status === 'approved') return r.claims > 0 ? 1 : 0
		if (r.status === 'fulfilled') return 2
		return 3
	}

	function byClaimability(list: PluginRequest[]): PluginRequest[] {
		return list
			.map((r, i) => ({ r, i }))
			.sort((a, b) => statusRank(a.r) - statusRank(b.r) || a.i - b.i)
			.map(({ r }) => r)
	}

	const kindLabels = $derived(new Map(kinds.map((k) => [k.key, k.label])))
	const totalVotes = $derived(requests.reduce((sum, r) => sum + r.upvotes, 0))
	const totalBuilders = $derived(requests.reduce((sum, r) => sum + r.claims, 0))

	function timeAgo(ms: number): string {
		const rtf = new Intl.RelativeTimeFormat(i18n.current, { numeric: 'auto' })
		const seconds = Math.round((ms - Date.now()) / 1000)
		const steps: [Intl.RelativeTimeFormatUnit, number][] = [
			['year', 31_536_000],
			['month', 2_592_000],
			['week', 604_800],
			['day', 86_400],
			['hour', 3_600],
			['minute', 60],
		]
		for (const [unit, size] of steps) {
			if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
		}
		return rtf.format(0, 'minute')
	}

	let cmsOverride = $state<PageRendered | null>(null)
	let cmsChecked = $state(false)

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.requests.get({
				query: {
					sort,
					limit: '100',
					// Keep pending requests out of this page, including for admins and requesters.
					status: 'approved,fulfilled,rejected',
					...(filterKind ? { kind: filterKind } : {}),
				},
			})
			if (error) throw error
			const res = data as { total: number; requests: PluginRequest[] }
			requests = byClaimability(res.requests)
			total = res.total
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
		const [kindsRes] = await Promise.all([eden.api.kinds.get(), load()])
		if (kindsRes.data) kinds = (kindsRes.data as { kinds: Kind[] }).kinds
	})

	function setFilter(next: string) {
		if (filterKind === next) return
		filterKind = next
		load()
	}

	function setSort(next: 'upvotes' | 'recent') {
		if (sort === next) return
		sort = next
		load()
	}

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
			requests = requests.map((r) => (r.id === req.id ? { ...r, upvotes: result.upvotes, votedByMe: result.voted } : r))
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
			const result = data as { claimed: boolean; claims: number; claimers: RequestClaimer[] }
			requests = requests.map((r) =>
				r.id === req.id ? { ...r, claimedByMe: result.claimed, claims: result.claims, claimers: result.claimers } : r,
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
			const { error } = await eden.api.requests.post({ name, description, ...(kind ? { kind } : {}) })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			name = ''
			description = ''
			kind = ''
			await load()
			toast.success(m.requests_created_pending())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to create request')
		} finally {
			creating = false
		}
	}
</script>

{#snippet pill(active: boolean, label: string, onclick: () => void, count?: number)}
	<button
		type="button"
		{onclick}
		aria-pressed={active}
		class={cn(
			'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
			active
				? 'border-foreground text-foreground'
				: 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
		)}
	>
		{label}
		{#if count !== undefined}<span class="font-mono text-[10px] opacity-70">{count}</span>{/if}
	</button>
{/snippet}

{#if !cmsChecked}
	<div class="mx-auto max-w-6xl px-6 py-12">
		<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
	</div>
{:else if cmsOverride}
	<div class="mx-auto max-w-4xl px-6 py-12 space-y-6">
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">{cmsOverride.title}</h1>
		</header>
		<CmsPage html={cmsOverride.html} />
	</div>
{:else}
	<div class="mx-auto max-w-6xl px-6 py-12 space-y-10">
		<header class="space-y-3">
			<div class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
				<Lightbulb class="h-3.5 w-3.5" />
				{m.requests_eyebrow()}
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">{m.requests_title()}</h1>
			<p class="text-muted-foreground max-w-2xl">{m.requests_subtitle()}</p>
			<dl class="flex flex-wrap gap-x-8 gap-y-2 pt-2 text-sm">
				<div class="flex items-baseline gap-2">
					<dt class="sr-only">{m.requests_stat_requests()}</dt>
					<dd class="font-mono text-lg text-foreground tabular-nums">{total}</dd>
					<span class="text-muted-foreground">{m.requests_stat_requests()}</span>
				</div>
				<div class="flex items-baseline gap-2">
					<dt class="sr-only">{m.requests_stat_votes()}</dt>
					<dd class="font-mono text-lg text-foreground tabular-nums">{totalVotes}</dd>
					<span class="text-muted-foreground">{m.requests_stat_votes()}</span>
				</div>
				<div class="flex items-baseline gap-2">
					<dt class="sr-only">{m.requests_stat_builders()}</dt>
					<dd class="font-mono text-lg text-foreground tabular-nums">{totalBuilders}</dd>
					<span class="text-muted-foreground">{m.requests_stat_builders()}</span>
				</div>
			</dl>
		</header>

		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<section class="space-y-4 min-w-0">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex flex-wrap items-center gap-1.5">
						{#if kinds.length > 0}
							{@render pill(filterKind === '', m.requests_filter_all(), () => setFilter(''))}
							{#each kinds as k (k.key)}
								{@render pill(filterKind === k.key, k.label, () => setFilter(k.key))}
							{/each}
						{:else}
							<h2 class="text-xl font-semibold tracking-tight">{m.requests_open()}</h2>
						{/if}
					</div>
					<div
						class="inline-flex rounded-md border border-border p-0.5 text-xs"
						role="group"
						aria-label={m.requests_sort()}
					>
						<button
							type="button"
							aria-pressed={sort === 'upvotes'}
							onclick={() => setSort('upvotes')}
							class={cn(
								'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 transition-colors',
								sort === 'upvotes' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
							)}
						>
							<Flame class="h-3.5 w-3.5" />
							{m.requests_sort_top()}
						</button>
						<button
							type="button"
							aria-pressed={sort === 'recent'}
							onclick={() => setSort('recent')}
							class={cn(
								'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 transition-colors',
								sort === 'recent' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
							)}
						>
							<Clock class="h-3.5 w-3.5" />
							{m.requests_sort_new()}
						</button>
					</div>
				</div>

				{#if loading}
					{#each Array(4) as _}
						<Skeleton class="h-24 rounded-lg" />
					{/each}
				{:else if requests.length === 0}
					<div class="rounded-lg border border-dashed border-border p-10 text-center space-y-2">
						<Lightbulb class="mx-auto h-6 w-6 text-primary" />
						<p class="text-muted-foreground">{m.requests_empty()}</p>
					</div>
				{:else}
					<ol class="space-y-3">
						{#each requests as r, i (r.id)}
							<li>
								<Card class="transition-colors hover:border-primary/40">
									<CardContent class="flex gap-4 p-4 sm:p-5">
										<button
											type="button"
											onclick={() => vote(r)}
											aria-label={m.requests_upvote()}
											aria-pressed={r.votedByMe}
											disabled={r.status !== 'approved'}
											class={cn(
												'flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-60',
												r.votedByMe ? 'border-primary/60 text-primary' : 'border-border',
											)}
										>
											<ArrowUp class="h-4 w-4" />
											<span class="font-mono text-sm tabular-nums">{r.upvotes}</span>
										</button>
										<div class="min-w-0 flex-1 space-y-1.5">
											<div class="flex flex-wrap items-center gap-2">
												{#if sort === 'upvotes' && i < 3 && r.upvotes > 0 && r.status === 'approved'}
													<span class="font-mono text-xs text-primary">#{i + 1}</span>
												{/if}
												<h3 class="font-semibold tracking-tight">{r.name}</h3>
												{#if r.kind}
													<Badge variant="outline">{kindLabels.get(r.kind) ?? r.kind}</Badge>
												{/if}
												{#if r.status === 'fulfilled'}
													<Badge>{m.requests_status_shipped()}</Badge>
												{:else if r.status === 'rejected'}
													<Badge variant="destructive">{m.requests_status_rejected()}</Badge>
												{:else if r.claims > 0}
													<Badge variant="secondary">{m.requests_status_in_progress()}</Badge>
												{/if}
											</div>
											<p class="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">{r.description}</p>
											{#if r.status === 'rejected' && r.rejectionReason}
												<p class="text-xs text-destructive">{r.rejectionReason}</p>
											{/if}
											<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
												<span>{timeAgo(r.createdAt)}</span>
												{#if r.claims > 0}
													<span class="inline-flex items-center gap-1">
														<Hammer class="h-3 w-3" />
														{m.requests_claim_count({ count: r.claims })}
													</span>
												{/if}
												{#if r.fulfilledPlugin}
													<a
														href={`/plugins/${encodeURIComponent(r.fulfilledPlugin.id)}`}
														class="inline-flex items-center gap-1 text-primary hover:underline"
													>
														<PackageCheck class="h-3 w-3" />
														{m.requests_view_plugin()}
													</a>
												{/if}
											</div>
											{#if r.claimers.length > 0}
												<ul class="flex flex-wrap items-center gap-2 pt-1">
													{#each r.claimers as c (c.userId)}
														<li class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
															{#if c.avatarUrl}
																<img
																	src={c.avatarUrl}
																	alt=""
																	class="h-5 w-5 rounded-full border border-border"
																	loading="lazy"
																/>
															{/if}
															<span>{c.username ?? c.displayName}</span>
															{#if c.repoUrl}
																<a
																	href={c.repoUrl}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="inline-flex items-center gap-0.5 text-primary hover:underline"
																>
																	<GitBranch class="h-3 w-3" />
																	{m.requests_repo()}
																</a>
															{/if}
														</li>
													{/each}
												</ul>
											{/if}
										</div>
										<div class="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
											{#if r.claimedByMe && r.status === 'approved' && r.kind && SCAFFOLD_KINDS.has(r.kind)}
												<Button type="button" size="sm" onclick={() => (scaffoldTarget = r)}>
													<GitBranch class="h-4 w-4" />
													<span class="hidden sm:inline">{m.requests_start_building()}</span>
												</Button>
											{/if}
											<Button
												type="button"
												variant={r.claimedByMe ? 'default' : 'outline'}
												size="sm"
												onclick={() => claim(r)}
												disabled={!auth.user || (r.status !== 'approved' && !r.claimedByMe)}
												title={auth.user ? undefined : m.requests_sign_in_to_claim()}
											>
												<Hammer class="h-4 w-4" />
												<span class="hidden sm:inline">{r.claimedByMe ? m.requests_claimed() : m.requests_claim()}</span
												>
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
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<aside class="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]">
				{#if requestsEnabled && !auth.user && !auth.loading}
					<Card>
						<CardContent class="p-5 sm:p-6 space-y-4">
							<div class="space-y-1">
								<h2 class="text-lg font-semibold tracking-tight">{m.requests_form_title()}</h2>
								<p class="text-sm text-muted-foreground">{m.requests_form_subtitle()}</p>
							</div>
							<p class="text-sm">{m.requests_sign_in_required()}</p>
							<Button class="w-full" href={`/login?return_to=${encodeURIComponent('/requests')}`}>
								<LogIn class="h-4 w-4" />
								{m.requests_sign_in_to_create()}
							</Button>
						</CardContent>
					</Card>
				{:else if requestsEnabled}
					<Card>
						<CardContent class="p-5 sm:p-6">
							<form onsubmit={createRequest} class="space-y-5">
								<div class="space-y-1">
									<h2 class="text-lg font-semibold tracking-tight">{m.requests_form_title()}</h2>
									<p class="text-sm text-muted-foreground">{m.requests_form_subtitle()}</p>
								</div>
								<div class="space-y-2">
									<Label for="name">{m.requests_name()}</Label>
									<Input
										id="name"
										bind:value={name}
										placeholder={m.requests_name_placeholder()}
										maxlength={120}
										required
									/>
								</div>
								{#if kinds.length > 0}
									<div class="space-y-2">
										<span class="text-sm font-medium leading-none"
											>{m.requests_kind()} <span class="text-destructive" aria-hidden="true">*</span></span
										>
										<div
											class="flex flex-wrap gap-1.5"
											role="radiogroup"
											aria-label={m.requests_kind()}
											aria-required="true"
										>
											{#each kinds as k (k.key)}
												<button
													type="button"
													role="radio"
													aria-checked={kind === k.key}
													title={k.description ?? undefined}
													onclick={() => (kind = k.key)}
													class={cn(
														'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
														kind === k.key
															? 'border-primary bg-primary/10 text-primary'
															: 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
													)}
												>
													{k.label}
												</button>
											{/each}
										</div>
										<p class="text-xs text-muted-foreground">{m.requests_kind_hint()}</p>
									</div>
								{/if}
								<div class="space-y-2">
									<div class="flex items-baseline justify-between">
										<Label for="desc">{m.requests_description()}</Label>
										<span class="font-mono text-[10px] text-muted-foreground tabular-nums"
											>{description.length}/{DESCRIPTION_MAX}</span
										>
									</div>
									<Textarea
										id="desc"
										bind:value={description}
										placeholder={m.requests_description_placeholder()}
										maxlength={DESCRIPTION_MAX}
										rows={5}
										required
									/>
								</div>
								<Button type="submit" class="w-full" disabled={creating || !auth.user || (kinds.length > 0 && !kind)}>
									<Plus class="h-4 w-4" />
									{creating ? m.requests_creating() : m.requests_create()}
								</Button>
							</form>
						</CardContent>
					</Card>
				{:else}
					<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						{m.requests_disabled()}
					</div>
				{/if}
			</aside>
		</div>
	</div>
{/if}

{#if scaffoldTarget}
	{@const target = scaffoldTarget}
	<ScaffoldDialog
		request={target}
		onClose={() => (scaffoldTarget = null)}
		onScaffolded={(claimers) =>
			(requests = requests.map((r) => (r.id === target.id ? { ...r, claimers, claims: claimers.length } : r)))}
	/>
{/if}

{#if deleteTarget}
	<ConfirmDialog
		open={deleteTarget !== null}
		title={m.requests_admin_delete_confirm()}
		description={deleteTarget.name}
		confirmWord="DELETE"
		busy={deleting}
		onConfirm={confirmDeleteRequest}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}
