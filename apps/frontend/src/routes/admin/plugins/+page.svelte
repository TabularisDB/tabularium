<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Check from '@lucide/svelte/icons/check'
	import X from '@lucide/svelte/icons/x'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import Webhook from '@lucide/svelte/icons/webhook'
	import Star from '@lucide/svelte/icons/star'
	import StarOff from '@lucide/svelte/icons/star-off'
	import Pin from '@lucide/svelte/icons/pin'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import Button from '$components/ui/Button.svelte'
	import Tabs from '$components/ui/Tabs.svelte'
	import TabsList from '$components/ui/TabsList.svelte'
	import TabsTrigger from '$components/ui/TabsTrigger.svelte'
	import { api } from '$lib/api'

	type AdminPlugin = {
		id: string
		ownerId: string
		name: string
		description: string
		repoUrl: string
		status: 'approved' | 'pending' | 'rejected'
		rejectionReason: string | null
		latestVersion: string | null
		featured?: boolean
		category?: string | null
		createdAt: number
		updatedAt: number
	}

	let plugins = $state<AdminPlugin[]>([])
	let loading = $state(true)
	let filter = $state<'all' | 'approved' | 'pending' | 'rejected'>('all')
	let busy = $state<Record<string, boolean>>({})
	let selected = $state<Set<string>>(new Set())
	let bulkBusy = $state(false)

	async function load() {
		loading = true
		try {
			const q = filter === 'all' ? '' : `?status=${filter}`
			const data = await api.get<{ plugins: AdminPlugin[] }>(`/api/admin/plugins${q}`)
			plugins = data.plugins
			selected = new Set([...selected].filter((id) => plugins.some((p) => p.id === id)))
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load plugins')
		} finally {
			loading = false
		}
	}

	function toggleSelected(id: string, checked: boolean) {
		const next = new Set(selected)
		if (checked) next.add(id)
		else next.delete(id)
		selected = next
	}

	function toggleAll(checked: boolean) {
		if (!checked) {
			selected = new Set()
			return
		}
		selected = new Set(plugins.map((p) => p.id))
	}

	async function bulk(action: 'approve' | 'reject' | 'delete') {
		if (selected.size === 0) return
		let rejectionReason: string | undefined
		if (action === 'reject') {
			const r = prompt(`Reject ${selected.size} plugin(s) — optional reason:`)
			if (r === null) return
			rejectionReason = r || undefined
		} else if (action === 'delete') {
			if (!confirm(`Delete ${selected.size} plugin(s) and their releases? This is permanent.`)) return
		}
		bulkBusy = true
		try {
			const res = await api.post<{ ok: boolean; action: string; affected: number; missing: string[] }>(
				'/api/admin/plugins/bulk',
				{ ids: [...selected], action, rejectionReason },
			)
			toast.success(`${res.action}: ${res.affected} affected${res.missing.length > 0 ? `, ${res.missing.length} missing` : ''}`)
			selected = new Set()
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Bulk action failed')
		} finally {
			bulkBusy = false
		}
	}

	onMount(load)

	$effect(() => {
		void filter
		load()
	})

	async function setStatus(p: AdminPlugin, status: 'approved' | 'pending' | 'rejected') {
		const reason = status === 'rejected' ? prompt('Reason for rejection (shown to owner via webhook):') : undefined
		if (status === 'rejected' && reason === null) return
		busy = { ...busy, [p.id]: true }
		try {
			await api.patch(`/api/admin/plugins/${p.id}`, { status, rejectionReason: reason ?? undefined })
			toast.success(`${p.name} → ${status}`)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update')
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function toggleFeatured(p: AdminPlugin) {
		busy = { ...busy, [p.id]: true }
		try {
			await api.patch(`/api/admin/plugins/${p.id}`, { featured: !p.featured })
			toast.success(p.featured ? 'Unpinned' : 'Pinned to featured')
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed')
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function refreshManifest(p: AdminPlugin) {
		busy = { ...busy, [p.id]: true }
		try {
			await api.post(`/api/admin/plugins/${p.id}/refresh-manifest`, {})
			toast.success(`Manifest refreshed for ${p.name}`)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Refresh failed')
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function replayWebhook(p: AdminPlugin) {
		busy = { ...busy, [p.id]: true }
		try {
			const res = await api.post<{ ok: boolean; version?: string; assets?: string[]; skipped?: boolean; reason?: string }>(
				`/api/admin/plugins/${p.id}/replay-webhook`,
				{},
			)
			if (res.skipped) toast(`Skipped: ${res.reason}`)
			else toast.success(`Replayed v${res.version} (${res.assets?.length ?? 0} assets)`)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Replay failed')
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function remove(p: AdminPlugin) {
		if (!confirm(`Delete ${p.name}? This wipes releases too.`)) return
		busy = { ...busy, [p.id]: true }
		try {
			await api.delete(`/api/admin/plugins/${p.id}`)
			toast.success(`${p.name} deleted`)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to delete')
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Plugins</h1>
	<p class="text-sm text-muted-foreground">Browse, approve, reject, or delete plugins.</p>
</header>

<Tabs bind:value={filter}>
	<TabsList>
		<TabsTrigger value="all">All</TabsTrigger>
		<TabsTrigger value="pending">Pending</TabsTrigger>
		<TabsTrigger value="approved">Approved</TabsTrigger>
		<TabsTrigger value="rejected">Rejected</TabsTrigger>
	</TabsList>
</Tabs>

{#if selected.size > 0}
	<div class="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
		<span class="text-sm">
			<strong class="text-foreground">{selected.size}</strong> selected
		</span>
		<div class="flex items-center gap-1.5">
			<Button size="sm" variant="default" onclick={() => bulk('approve')} disabled={bulkBusy}>
				<Check class="h-3.5 w-3.5" />
				Approve
			</Button>
			<Button size="sm" variant="outline" onclick={() => bulk('reject')} disabled={bulkBusy}>
				<X class="h-3.5 w-3.5" />
				Reject
			</Button>
			<Button size="sm" variant="destructive" onclick={() => bulk('delete')} disabled={bulkBusy}>
				<Trash2 class="h-3.5 w-3.5" />
				Delete
			</Button>
			<Button size="sm" variant="ghost" onclick={() => (selected = new Set())} disabled={bulkBusy}>
				Clear
			</Button>
		</div>
	</div>
{/if}

<Card>
	<CardHeader>
		<CardTitle class="text-base">{plugins.length} plugin{plugins.length === 1 ? '' : 's'}</CardTitle>
		<CardDescription>
			Pending plugins return <code class="font-mono">423</code> from the webhook ingest until approved. Toggle approval mode in
			<a href="/admin/instance" class="text-primary hover:underline">Instance settings</a>.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if plugins.length === 0}
			<p class="text-sm text-muted-foreground">No plugins in this state.</p>
		{:else}
			<label class="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
				<input
					type="checkbox"
					checked={selected.size === plugins.length && plugins.length > 0}
					indeterminate={selected.size > 0 && selected.size < plugins.length}
					onchange={(e) => toggleAll(e.currentTarget.checked)}
					class="h-3.5 w-3.5 rounded border-input"
				/>
				<span>Select all on this page</span>
			</label>
			{#each plugins as p (p.id)}
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3">
					<input
						type="checkbox"
						checked={selected.has(p.id)}
						onchange={(e) => toggleSelected(p.id, e.currentTarget.checked)}
						class="h-4 w-4 rounded border-input flex-shrink-0"
						aria-label={`Select ${p.name}`}
					/>
					<div class="space-y-0.5 min-w-0 flex-1">
						<div class="flex items-center gap-2 flex-wrap">
							<a href={`/plugins/${p.id}`} class="text-sm font-medium truncate hover:text-primary">{p.name}</a>
							<Badge
								variant={p.status === 'approved' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'}
								class="text-[10px]"
							>
								{p.status}
							</Badge>
							{#if p.featured}
								<Badge variant="default" class="text-[10px] gap-1"><Pin class="h-2.5 w-2.5" />featured</Badge>
							{/if}
							{#if p.category}
								<Badge variant="outline" class="text-[10px]">{p.category}</Badge>
							{/if}
							{#if p.latestVersion}
								<Badge variant="secondary" class="font-mono text-[10px]">v{p.latestVersion}</Badge>
							{/if}
						</div>
						<div class="text-xs text-muted-foreground truncate">{p.id} · {p.repoUrl}</div>
						{#if p.rejectionReason}
							<div class="text-xs text-destructive">Reason: {p.rejectionReason}</div>
						{/if}
					</div>
					<div class="flex items-center gap-1">
						<Button variant="ghost" size="sm" onclick={() => toggleFeatured(p)} disabled={busy[p.id]} aria-label={p.featured ? 'Unpin' : 'Pin to featured'} title={p.featured ? 'Unpin' : 'Pin to featured'}>
							{#if p.featured}<StarOff class="h-3.5 w-3.5" />{:else}<Star class="h-3.5 w-3.5" />{/if}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => refreshManifest(p)} disabled={busy[p.id]} aria-label="Refresh manifest" title="Refresh .pluggr manifest">
							<RefreshCw class="h-3.5 w-3.5" />
						</Button>
						<Button variant="ghost" size="sm" onclick={() => replayWebhook(p)} disabled={busy[p.id]} aria-label="Replay webhook" title="Re-ingest latest upstream release">
							<Webhook class="h-3.5 w-3.5" />
						</Button>
						{#if p.status !== 'approved'}
							<Button variant="ghost" size="sm" onclick={() => setStatus(p, 'approved')} disabled={busy[p.id]} aria-label="Approve" title="Approve">
								<Check class="h-3.5 w-3.5" />
							</Button>
						{/if}
						{#if p.status !== 'rejected'}
							<Button variant="ghost" size="sm" onclick={() => setStatus(p, 'rejected')} disabled={busy[p.id]} aria-label="Reject" title="Reject">
								<X class="h-3.5 w-3.5" />
							</Button>
						{/if}
						<Button variant="ghost" size="sm" onclick={() => remove(p)} disabled={busy[p.id]} aria-label="Delete" title="Delete">
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>
