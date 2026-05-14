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
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

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
			const query = filter === 'all' ? {} : { status: filter }
			const { data, error } = await eden.api.admin.plugins.get({ query })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			plugins = (data as { plugins: AdminPlugin[] }).plugins
			selected = new Set([...selected].filter((id) => plugins.some((p) => p.id === id)))
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_load_failed())
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
			const r = prompt(m.admin_plugins_bulk_reject_prompt({ count: selected.size }))
			if (r === null) return
			rejectionReason = r || undefined
		} else if (action === 'delete') {
			if (!confirm(m.admin_plugins_bulk_delete_confirm({ count: selected.size }))) return
		}
		bulkBusy = true
		try {
			const { data, error } = await eden.api.admin.plugins.bulk.post(
				{ ids: [...selected], action, rejectionReason },
			)
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as { ok: boolean; action: string; affected: number; missing: string[] }
			const base = m.admin_plugins_bulk_result({ action: res.action, affected: res.affected })
			const extra = res.missing.length > 0 ? m.admin_plugins_bulk_result_missing({ count: res.missing.length }) : ''
			toast.success(base + extra)
			selected = new Set()
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_bulk_failed())
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
		const reason = status === 'rejected' ? prompt(m.admin_plugins_rejection_prompt()) : undefined
		if (status === 'rejected' && reason === null) return
		busy = { ...busy, [p.id]: true }
		try {
			const { error } = await eden.api.admin.plugins({ id: p.id }).patch({ status, rejectionReason: reason ?? undefined })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_plugins_status_change({ name: p.name, status }))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_update_failed())
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function toggleFeatured(p: AdminPlugin) {
		busy = { ...busy, [p.id]: true }
		try {
			const { error } = await eden.api.admin.plugins({ id: p.id }).patch({ featured: !p.featured })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(p.featured ? m.admin_plugins_unpinned() : m.admin_plugins_pinned())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_update_failed())
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function refreshManifest(p: AdminPlugin) {
		busy = { ...busy, [p.id]: true }
		try {
			const { error } = await eden.api.admin.plugins({ id: p.id })['refresh-manifest'].post({})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_plugins_manifest_refreshed({ name: p.name }))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_refresh_failed())
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function replayWebhook(p: AdminPlugin) {
		busy = { ...busy, [p.id]: true }
		try {
			const { data, error } = await eden.api.admin.plugins({ id: p.id })['replay-webhook'].post({})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as { ok: boolean; version?: string; assets?: string[]; skipped?: boolean; reason?: string }
			if (res.skipped) toast(m.admin_plugins_replay_skipped({ reason: res.reason ?? '' }))
			else toast.success(m.admin_plugins_replayed({ version: res.version ?? '', count: res.assets?.length ?? 0 }))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_replay_failed())
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function remove(p: AdminPlugin) {
		if (!confirm(m.admin_plugins_confirm_delete({ name: p.name }))) return
		busy = { ...busy, [p.id]: true }
		try {
			const { error } = await eden.api.admin.plugins({ id: p.id }).delete()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_plugins_deleted({ name: p.name }))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_delete_failed())
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_plugins_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_plugins_subtitle()}</p>
</header>

<Tabs bind:value={filter}>
	<TabsList>
		<TabsTrigger value="all">{m.admin_plugins_tab_all()}</TabsTrigger>
		<TabsTrigger value="pending">{m.admin_plugins_tab_pending()}</TabsTrigger>
		<TabsTrigger value="approved">{m.admin_plugins_tab_approved()}</TabsTrigger>
		<TabsTrigger value="rejected">{m.admin_plugins_tab_rejected()}</TabsTrigger>
	</TabsList>
</Tabs>

{#if selected.size > 0}
	<div class="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
		<span class="text-sm">
			<strong class="text-foreground">{selected.size}</strong> {m.admin_plugins_selected()}
		</span>
		<div class="flex items-center gap-1.5">
			<Button size="sm" variant="default" onclick={() => bulk('approve')} disabled={bulkBusy}>
				<Check class="h-3.5 w-3.5" />
				{m.admin_plugins_approve()}
			</Button>
			<Button size="sm" variant="outline" onclick={() => bulk('reject')} disabled={bulkBusy}>
				<X class="h-3.5 w-3.5" />
				{m.admin_plugins_reject()}
			</Button>
			<Button size="sm" variant="destructive" onclick={() => bulk('delete')} disabled={bulkBusy}>
				<Trash2 class="h-3.5 w-3.5" />
				{m.admin_plugins_delete()}
			</Button>
			<Button size="sm" variant="ghost" onclick={() => (selected = new Set())} disabled={bulkBusy}>
				{m.admin_plugins_clear()}
			</Button>
		</div>
	</div>
{/if}

<Card>
	<CardHeader>
		<CardTitle class="text-base">{plugins.length === 1 ? m.admin_plugins_count_one({ count: plugins.length }) : m.admin_plugins_count_other({ count: plugins.length })}</CardTitle>
		<CardDescription>
			{m.admin_plugins_card_subtitle_prefix()} <code class="font-mono">423</code> {m.admin_plugins_card_subtitle_middle()}
			<a href="/admin/instance" class="text-primary hover:underline">{m.admin_plugins_instance_settings()}</a>.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if plugins.length === 0}
			<p class="text-sm text-muted-foreground">{m.admin_plugins_empty()}</p>
		{:else}
			<label class="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
				<input
					type="checkbox"
					checked={selected.size === plugins.length && plugins.length > 0}
					indeterminate={selected.size > 0 && selected.size < plugins.length}
					onchange={(e) => toggleAll(e.currentTarget.checked)}
					class="h-3.5 w-3.5 rounded border-input"
				/>
				<span>{m.admin_plugins_select_all()}</span>
			</label>
			{#each plugins as p (p.id)}
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3">
					<input
						type="checkbox"
						checked={selected.has(p.id)}
						onchange={(e) => toggleSelected(p.id, e.currentTarget.checked)}
						class="h-4 w-4 rounded border-input flex-shrink-0"
						aria-label={m.admin_plugins_select_aria({ name: p.name })}
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
								<Badge variant="default" class="text-[10px] gap-1"><Pin class="h-2.5 w-2.5" />{m.admin_plugins_featured()}</Badge>
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
							<div class="text-xs text-destructive">{m.admin_plugins_reason({ reason: p.rejectionReason })}</div>
						{/if}
					</div>
					<div class="flex items-center gap-1">
						<Button variant="ghost" size="sm" onclick={() => toggleFeatured(p)} disabled={busy[p.id]} aria-label={p.featured ? m.admin_plugins_unpin() : m.admin_plugins_pin()} title={p.featured ? m.admin_plugins_unpin() : m.admin_plugins_pin()}>
							{#if p.featured}<StarOff class="h-3.5 w-3.5" />{:else}<Star class="h-3.5 w-3.5" />{/if}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => refreshManifest(p)} disabled={busy[p.id]} aria-label={m.admin_plugins_refresh_manifest()} title={m.admin_plugins_refresh_manifest_title()}>
							<RefreshCw class="h-3.5 w-3.5" />
						</Button>
						<Button variant="ghost" size="sm" onclick={() => replayWebhook(p)} disabled={busy[p.id]} aria-label={m.admin_plugins_replay_webhook()} title={m.admin_plugins_replay_webhook_title()}>
							<Webhook class="h-3.5 w-3.5" />
						</Button>
						{#if p.status !== 'approved'}
							<Button variant="ghost" size="sm" onclick={() => setStatus(p, 'approved')} disabled={busy[p.id]} aria-label={m.admin_plugins_approve()} title={m.admin_plugins_approve()}>
								<Check class="h-3.5 w-3.5" />
							</Button>
						{/if}
						{#if p.status !== 'rejected'}
							<Button variant="ghost" size="sm" onclick={() => setStatus(p, 'rejected')} disabled={busy[p.id]} aria-label={m.admin_plugins_reject()} title={m.admin_plugins_reject()}>
								<X class="h-3.5 w-3.5" />
							</Button>
						{/if}
						<Button variant="ghost" size="sm" onclick={() => remove(p)} disabled={busy[p.id]} aria-label={m.admin_plugins_delete()} title={m.admin_plugins_delete()}>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>
