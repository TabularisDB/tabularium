<script lang="ts">
	import { onMount } from 'svelte'
	import Lightbulb from '@lucide/svelte/icons/lightbulb'
	import Check from '@lucide/svelte/icons/check'
	import X from '@lucide/svelte/icons/x'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import ArrowUp from '@lucide/svelte/icons/arrow-up'
	import Hammer from '@lucide/svelte/icons/hammer'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import TabBar from '$components/admin/TabBar.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'
	import { toast } from 'svelte-sonner'
	import type { BoardStatus, PluginRequest, RequestBounty, RequestStatus } from '$lib/types'

	type Draft = {
		boardStatus: BoardStatus
		tagline: string
		stage: string
		nextStep: string
		difficulty: '' | NonNullable<RequestBounty['difficulty']>
		accent: string
		tags: string
		capabilities: string
		signal: string
		sponsorUrl: string
		rejectionReason: string
	}

	let status = $state<RequestStatus>('pending')
	let requests = $state<PluginRequest[]>([])
	let loading = $state(true)
	let expanded = $state<string | null>(null)
	let drafts = $state<Record<string, Draft>>({})
	let busy = $state<string | null>(null)

	const tabs = $derived([
		{ id: 'pending' as const, label: m.admin_requests_tab_pending() },
		{ id: 'approved' as const, label: m.admin_requests_tab_approved() },
		{ id: 'fulfilled' as const, label: m.requests_status_shipped() },
		{ id: 'rejected' as const, label: m.requests_status_rejected() },
	])

	const boardLabels: Record<BoardStatus, () => string> = {
		open: m.admin_requests_board_open,
		'most-wanted': m.admin_requests_board_most_wanted,
		scoped: m.admin_requests_board_scoped,
		'coming-soon': m.admin_requests_board_coming_soon,
	}

	function toDraft(r: PluginRequest): Draft {
		const b = r.bounty ?? {}
		return {
			boardStatus: b.boardStatus ?? 'open',
			tagline: b.tagline ?? '',
			stage: b.stage ?? '',
			nextStep: b.nextStep ?? '',
			difficulty: b.difficulty ?? '',
			accent: b.accent ?? '',
			tags: (b.tags ?? []).join(', '),
			capabilities: (b.capabilities ?? []).map((c) => `${c.label} = ${c.state}`).join('\n'),
			signal: b.signal ?? '',
			sponsorUrl: b.sponsorUrl ?? '',
			rejectionReason: r.rejectionReason ?? '',
		}
	}

	// Free-form fields left empty are dropped; radar placement is kept as is.
	function toBounty(d: Draft, previous: RequestBounty | null): RequestBounty {
		const capabilities = d.capabilities
			.split('\n')
			.map((line) => line.split('='))
			.filter(([label]) => label?.trim())
			.map(([label, state]): NonNullable<RequestBounty['capabilities']>[number] => {
				const s = state?.trim()
				return { label: label.trim(), state: s === 'ready' || s === 'stretch' ? s : 'needed' }
			})
		const tags = d.tags
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
		const bounty: RequestBounty = { boardStatus: d.boardStatus }
		if (d.tagline.trim()) bounty.tagline = d.tagline.trim()
		if (d.stage.trim()) bounty.stage = d.stage.trim()
		if (d.nextStep.trim()) bounty.nextStep = d.nextStep.trim()
		if (d.difficulty) bounty.difficulty = d.difficulty
		if (/^#[0-9a-fA-F]{6}$/.test(d.accent.trim())) bounty.accent = d.accent.trim()
		if (tags.length > 0) bounty.tags = tags
		if (capabilities.length > 0) bounty.capabilities = capabilities
		if (d.signal.trim()) bounty.signal = d.signal.trim()
		if (d.sponsorUrl.trim()) bounty.sponsorUrl = d.sponsorUrl.trim()
		if (previous?.radar) bounty.radar = previous.radar
		return bounty
	}

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.requests.get({ query: { status, sort: 'recent', limit: '100' } })
			if (error) throw error
			requests = (data as { requests: PluginRequest[] }).requests
			drafts = Object.fromEntries(requests.map((r) => [r.id, toDraft(r)]))
		} catch {
			requests = []
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function save(r: PluginRequest, next?: RequestStatus) {
		const draft = drafts[r.id]
		busy = r.id
		try {
			const { data, error } = await eden.api.admin.requests({ id: r.id }).patch({
				bounty: toBounty(draft, r.bounty),
				...(next ? { status: next } : {}),
				...(next === 'rejected' ? { rejectionReason: draft.rejectionReason.trim() || null } : {}),
			})
			if (error)
				throw new Error(
					typeof error.value === 'object' && error.value
						? ((error.value as { error?: string; message?: string }).error ??
								(error.value as { message?: string }).message ??
								`Request failed (${error.status})`)
						: `Request failed (${error.status})`,
				)
			const updated = data as PluginRequest
			if (next && next !== status) {
				requests = requests.filter((x) => x.id !== r.id)
				expanded = null
			} else {
				requests = requests.map((x) => (x.id === r.id ? updated : x))
			}
			toast.success(m.admin_requests_saved())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e))
		} finally {
			busy = null
		}
	}
</script>

<div class="space-y-6">
	<AdminPageHeader title={m.admin_requests_title()} subtitle={m.admin_requests_subtitle()} icon={Lightbulb}>
		{#snippet actions()}
			<TabBar {tabs} bind:active={status} onChange={() => load()} size="sm" />
		{/snippet}
	</AdminPageHeader>

	{#if loading}
		{#each Array(3) as _}
			<Skeleton class="h-20 rounded-lg" />
		{/each}
	{:else if requests.length === 0}
		<div class="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
			{m.admin_requests_empty()}
		</div>
	{:else}
		<ul class="space-y-3">
			{#each requests as r (r.id)}
				{@const draft = drafts[r.id]}
				<li>
					<Card>
						<CardContent class="space-y-4 p-4 sm:p-5">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0 flex-1 space-y-1">
									<div class="flex flex-wrap items-center gap-2">
										<h2 class="font-semibold tracking-tight">{r.name}</h2>
										<code class="text-xs text-muted-foreground">{r.slug}</code>
										{#if r.kind}<Badge variant="outline">{r.kind}</Badge>{/if}
										{#if r.status === 'approved' && r.claims > 0}
											<Badge variant="secondary">{m.requests_status_in_progress()}</Badge>
										{/if}
									</div>
									<p class="text-sm text-muted-foreground whitespace-pre-line">{r.description}</p>
									<div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
										<span class="inline-flex items-center gap-1"><ArrowUp class="h-3 w-3" />{r.upvotes}</span>
										<span class="inline-flex items-center gap-1"><Hammer class="h-3 w-3" />{r.claims}</span>
										<span>{new Date(r.createdAt).toLocaleDateString()}</span>
										{#if r.fulfilledPlugin}
											<a
												href={`/plugins/${encodeURIComponent(r.fulfilledPlugin.id)}`}
												class="text-primary hover:underline">{r.fulfilledPlugin.name}</a
											>
										{/if}
									</div>
								</div>
								<div class="flex flex-wrap gap-2">
									{#if r.status !== 'approved' && r.status !== 'fulfilled'}
										<Button size="sm" onclick={() => save(r, 'approved')} disabled={busy === r.id}>
											<Check class="h-4 w-4" />
											{m.admin_requests_approve()}
										</Button>
									{/if}
									{#if r.status === 'pending' || r.status === 'approved'}
										<Button size="sm" variant="outline" onclick={() => (expanded = expanded === r.id ? null : r.id)}>
											{m.admin_requests_bounty()}
										</Button>
									{/if}
									{#if r.status === 'rejected'}
										<Button size="sm" variant="ghost" onclick={() => save(r, 'pending')} disabled={busy === r.id}>
											<RotateCcw class="h-4 w-4" />
											{m.admin_requests_reopen()}
										</Button>
									{/if}
								</div>
							</div>

							{#if r.status === 'rejected' && r.rejectionReason}
								<p class="text-sm">
									<span class="text-muted-foreground">{m.admin_requests_reject_reason()}:</span>
									{r.rejectionReason}
								</p>
							{/if}

							{#if expanded === r.id && draft}
								<div class="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
									<div class="space-y-2">
										<Label for={`board-${r.id}`}>{m.admin_requests_board_status()}</Label>
										<Select id={`board-${r.id}`} bind:value={draft.boardStatus}>
											{#each Object.entries(boardLabels) as [value, label] (value)}
												<option {value}>{label()}</option>
											{/each}
										</Select>
									</div>
									<div class="space-y-2">
										<Label for={`difficulty-${r.id}`}>{m.admin_requests_difficulty()}</Label>
										<Select id={`difficulty-${r.id}`} bind:value={draft.difficulty}>
											<option value="">—</option>
											<option value="Low">Low</option>
											<option value="Medium">Medium</option>
											<option value="High">High</option>
											<option value="Extreme">Extreme</option>
										</Select>
									</div>
									<div class="space-y-2 sm:col-span-2">
										<Label for={`tagline-${r.id}`}>{m.admin_requests_tagline()}</Label>
										<Input id={`tagline-${r.id}`} bind:value={draft.tagline} maxlength={200} />
									</div>
									<div class="space-y-2">
										<Label for={`stage-${r.id}`}>{m.admin_requests_stage()}</Label>
										<Input id={`stage-${r.id}`} bind:value={draft.stage} maxlength={120} />
									</div>
									<div class="space-y-2">
										<Label for={`accent-${r.id}`}>{m.admin_requests_accent()}</Label>
										<Input id={`accent-${r.id}`} bind:value={draft.accent} placeholder="#ff5a3d" class="font-mono" />
									</div>
									<div class="space-y-2 sm:col-span-2">
										<Label for={`next-${r.id}`}>{m.admin_requests_next_step()}</Label>
										<Textarea id={`next-${r.id}`} bind:value={draft.nextStep} rows={2} maxlength={1000} />
									</div>
									<div class="space-y-2 sm:col-span-2">
										<Label for={`caps-${r.id}`}>{m.admin_requests_capabilities()}</Label>
										<Textarea
											id={`caps-${r.id}`}
											bind:value={draft.capabilities}
											rows={4}
											class="font-mono"
											placeholder={'connect = needed\nschema = needed\nexplain = stretch'}
										/>
									</div>
									<div class="space-y-2">
										<Label for={`tags-${r.id}`}>{m.admin_requests_tags()}</Label>
										<Input id={`tags-${r.id}`} bind:value={draft.tags} />
									</div>
									<div class="space-y-2">
										<Label for={`sponsor-${r.id}`}>{m.admin_requests_sponsor_url()}</Label>
										<Input id={`sponsor-${r.id}`} bind:value={draft.sponsorUrl} maxlength={500} />
									</div>
									<div class="space-y-2 sm:col-span-2">
										<Label for={`signal-${r.id}`}>{m.admin_requests_signal()}</Label>
										<Textarea id={`signal-${r.id}`} bind:value={draft.signal} rows={2} maxlength={500} />
									</div>
									{#if r.status === 'pending'}
										<div class="space-y-2 sm:col-span-2">
											<Label for={`reason-${r.id}`}>{m.admin_requests_reject_reason()}</Label>
											<Input id={`reason-${r.id}`} bind:value={draft.rejectionReason} maxlength={500} />
										</div>
									{/if}
									<div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
										{#if r.status === 'pending'}
											<Button variant="ghost" size="sm" onclick={() => save(r, 'rejected')} disabled={busy === r.id}>
												<X class="h-4 w-4" />
												{m.admin_requests_reject()}
											</Button>
											<Button size="sm" onclick={() => save(r, 'approved')} disabled={busy === r.id}>
												<Check class="h-4 w-4" />
												{m.admin_requests_approve()}
											</Button>
										{:else}
											<Button size="sm" onclick={() => save(r)} disabled={busy === r.id}>
												{m.admin_requests_save()}
											</Button>
										{/if}
									</div>
								</div>
							{/if}
						</CardContent>
					</Card>
				</li>
			{/each}
		</ul>
	{/if}
</div>
