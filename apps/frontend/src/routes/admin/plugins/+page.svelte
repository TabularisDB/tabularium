<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import { DropdownMenu } from 'bits-ui'
	import MoreHorizontal from '@lucide/svelte/icons/ellipsis'
	import Check from '@lucide/svelte/icons/check'
	import X from '@lucide/svelte/icons/x'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import Webhook from '@lucide/svelte/icons/webhook'
	import RotateCw from '@lucide/svelte/icons/rotate-cw'
	import Star from '@lucide/svelte/icons/star'
	import StarOff from '@lucide/svelte/icons/star-off'
	import Pin from '@lucide/svelte/icons/pin'
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import ShieldOff from '@lucide/svelte/icons/shield-off'
	import Search from '@lucide/svelte/icons/search'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import TabBar from '$components/admin/TabBar.svelte'
	import PluginWebhookDialog from '$components/admin/PluginWebhookDialog.svelte'

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
		verified?: boolean
		verifiedAt?: number | null
		category?: string | null
		createdAt: number
		updatedAt: number
	}

	let allPlugins = $state<AdminPlugin[]>([])
	let loading = $state(true)
	let filter = $state<'all' | 'approved' | 'pending' | 'rejected'>('all')
	let search = $state('')
	let busy = $state<Record<string, boolean>>({})
	let selected = $state<Set<string>>(new Set())
	let bulkBusy = $state(false)
	let deleteTarget = $state<AdminPlugin | null>(null)
	let bulkDeleteOpen = $state(false)
	let webhookTarget = $state<AdminPlugin | null>(null)

	const actionButtonClass =
		'h-11 w-full min-w-0 justify-start gap-2 px-3 text-xs sm:h-9 sm:w-auto sm:min-w-28 sm:justify-center tabularis:h-11 tabularis:text-xs sm:tabularis:h-9 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0'

	const counts = $derived.by(() => {
		const c = { all: allPlugins.length, approved: 0, pending: 0, rejected: 0 }
		for (const p of allPlugins) c[p.status]++
		return c
	})

	const plugins = $derived.by(() => {
		const q = search.trim().toLowerCase()
		return allPlugins.filter((p) => {
			if (filter !== 'all' && p.status !== filter) return false
			if (!q) return true
			return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.repoUrl.toLowerCase().includes(q)
		})
	})

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.plugins.get({ query: {} })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			allPlugins = (data as { plugins: AdminPlugin[] }).plugins
			selected = new Set([...selected].filter((id) => allPlugins.some((p) => p.id === id)))
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

	async function bulk(action: 'approve' | 'reject' | 'delete' | 'transfer') {
		if (selected.size === 0) return
		let rejectionReason: string | undefined
		let ownerId: string | undefined
		if (action === 'reject') {
			const r = prompt(m.admin_plugins_bulk_reject_prompt({ count: selected.size }))
			if (r === null) return
			rejectionReason = r || undefined
		} else if (action === 'delete') {
			bulkDeleteOpen = true
			return
		} else if (action === 'transfer') {
			const o = prompt(m.admin_plugins_bulk_transfer_prompt({ count: selected.size }))
			if (!o?.trim()) return
			ownerId = o.trim()
		}
		await runBulk(action, rejectionReason, ownerId)
	}

	async function runBulk(
		action: 'approve' | 'reject' | 'delete' | 'transfer',
		rejectionReason?: string,
		ownerId?: string,
	) {
		bulkBusy = true
		try {
			const { data, error } = await eden.api.admin.plugins.bulk.post({
				ids: [...selected],
				action,
				rejectionReason,
				ownerId,
			})
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
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

	async function setStatus(p: AdminPlugin, status: 'approved' | 'pending' | 'rejected') {
		const reason = status === 'rejected' ? prompt(m.admin_plugins_rejection_prompt()) : undefined
		if (status === 'rejected' && reason === null) return
		busy = { ...busy, [p.id]: true }
		try {
			const { error } = await eden.api.admin
				.plugins({ id: p.id })
				.patch({ status, rejectionReason: reason ?? undefined })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
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
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(p.featured ? m.admin_plugins_unpinned() : m.admin_plugins_pinned())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_update_failed())
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}

	async function toggleVerified(p: AdminPlugin) {
		busy = { ...busy, [p.id]: true }
		try {
			const { error } = await eden.api.admin.plugins({ id: p.id }).patch({ verified: !p.verified })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(
				p.verified ? m.admin_plugins_unverified({ name: p.name }) : m.admin_plugins_verified_toast({ name: p.name }),
			)
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
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
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
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
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

	type PluginAction = {
		id: string
		label: string
		title: string
		icon: typeof Check
		run: () => void | Promise<void>
		pressed?: boolean
		color?: string
		danger?: boolean
	}

	function pluginActions(p: AdminPlugin): PluginAction[] {
		return [
			{
				id: 'featured',
				label: m.admin_plugins_action_featured(),
				title: p.featured ? m.admin_plugins_unpin() : m.admin_plugins_pin(),
				icon: p.featured ? StarOff : Star,
				run: () => toggleFeatured(p),
				pressed: p.featured ?? false,
				color: p.featured ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary' : '',
			},
			{
				id: 'verified',
				label: m.admin_plugins_action_verified(),
				title: p.verified ? m.admin_plugins_unverify() : m.admin_plugins_verify(),
				icon: p.verified ? ShieldOff : ShieldCheck,
				run: () => toggleVerified(p),
				pressed: p.verified ?? false,
				color: p.verified
					? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/15 hover:text-emerald-600'
					: '',
			},
			{
				id: 'manifest',
				label: 'Manifest',
				title: m.admin_plugins_refresh_manifest_title(),
				icon: RefreshCw,
				run: () => refreshManifest(p),
			},
			{
				id: 'webhook',
				label: 'Webhook',
				title: m.admin_plugins_webhook_manage(),
				icon: Webhook,
				run: () => {
					webhookTarget = p
				},
			},
			{
				id: 'replay',
				label: m.admin_plugins_action_replay(),
				title: m.admin_plugins_replay_webhook_title(),
				icon: RotateCw,
				run: () => replayWebhook(p),
			},
			...(p.status !== 'approved'
				? [
						{
							id: 'approve',
							label: m.admin_plugins_approve(),
							title: m.admin_plugins_approve(),
							icon: Check,
							run: () => setStatus(p, 'approved'),
							color: 'text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-600',
						},
					]
				: []),
			...(p.status !== 'rejected'
				? [
						{
							id: 'reject',
							label: m.admin_plugins_reject(),
							title: m.admin_plugins_reject(),
							icon: X,
							run: () => setStatus(p, 'rejected'),
							danger: true,
							color: 'text-destructive hover:bg-destructive/10 hover:text-destructive',
						},
					]
				: []),
			{
				id: 'delete',
				label: m.admin_plugins_delete(),
				title: m.admin_plugins_delete(),
				icon: Trash2,
				run: () => openRemove(p),
				danger: true,
				color: 'text-destructive hover:bg-destructive/10 hover:text-destructive',
			},
		]
	}

	function openRemove(p: AdminPlugin) {
		deleteTarget = p
	}

	async function confirmRemove() {
		const p = deleteTarget
		if (!p) return
		busy = { ...busy, [p.id]: true }
		try {
			const { error } = await eden.api.admin.plugins({ id: p.id }).delete()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_plugins_deleted({ name: p.name }))
			deleteTarget = null
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_plugins_delete_failed())
		} finally {
			busy = { ...busy, [p.id]: false }
		}
	}
</script>

<AdminPageHeader title={m.admin_plugins_title()} subtitle={m.admin_plugins_subtitle()} />

<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	<TabBar
		size="sm"
		bind:active={filter}
		tabs={[
			{ id: 'all', label: m.admin_plugins_tab_all(), badge: counts.all },
			{ id: 'pending', label: m.admin_plugins_tab_pending(), badge: counts.pending },
			{ id: 'approved', label: m.admin_plugins_tab_approved(), badge: counts.approved },
			{ id: 'rejected', label: m.admin_plugins_tab_rejected(), badge: counts.rejected },
		]}
	/>
	<div class="relative w-full sm:w-72">
		<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
		<Input bind:value={search} class="pl-9" placeholder={m.admin_plugins_search_placeholder()} />
	</div>
</div>

{#if selected.size > 0}
	<div
		class="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
	>
		<span class="text-sm whitespace-nowrap">
			<strong class="text-foreground">{selected.size}</strong>
			{m.admin_plugins_selected()}
		</span>
		<div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
			<Button size="sm" variant="default" class={actionButtonClass} onclick={() => bulk('approve')} disabled={bulkBusy}>
				<Check class="h-3.5 w-3.5" />
				{m.admin_plugins_approve()}
			</Button>
			<Button size="sm" variant="outline" class={actionButtonClass} onclick={() => bulk('reject')} disabled={bulkBusy}>
				<X class="h-3.5 w-3.5" />
				{m.admin_plugins_reject()}
			</Button>
			<Button
				size="sm"
				variant="outline"
				class={actionButtonClass}
				onclick={() => bulk('transfer')}
				disabled={bulkBusy}
			>
				<ArrowRightLeft class="h-3.5 w-3.5" />
				{m.admin_plugins_transfer()}
			</Button>
			<Button
				size="sm"
				variant="destructive"
				class={actionButtonClass}
				onclick={() => bulk('delete')}
				disabled={bulkBusy}
			>
				<Trash2 class="h-3.5 w-3.5" />
				{m.admin_plugins_delete()}
			</Button>
			<Button
				size="sm"
				variant="outline"
				class={actionButtonClass}
				onclick={() => (selected = new Set())}
				disabled={bulkBusy}
			>
				{m.admin_plugins_clear()}
			</Button>
		</div>
	</div>
{/if}

<Card>
	<CardHeader>
		<CardTitle class="text-base"
			>{plugins.length === 1
				? m.admin_plugins_count_one({ count: plugins.length })
				: m.admin_plugins_count_other({ count: plugins.length })}</CardTitle
		>
		<CardDescription>
			{m.admin_plugins_card_subtitle_prefix()} <code class="font-mono">423</code>
			{m.admin_plugins_card_subtitle_middle()}
			<a href="/admin/instance" class="text-primary hover:underline">{m.admin_plugins_instance_settings()}</a>.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if plugins.length === 0}
			<p class="text-sm text-muted-foreground">{m.admin_plugins_empty()}</p>
		{:else}
			<label class="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-xs text-muted-foreground sm:min-h-9">
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
				{@const actions = pluginActions(p)}
				{@const menuActions = actions.filter((a) => a.id !== 'webhook')}
				<div
					class="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-4 rounded-lg border border-border bg-card/50 p-3 sm:p-4"
				>
					<label class="-ml-3 -mt-2 flex h-11 w-11 cursor-pointer items-center justify-center">
						<input
							type="checkbox"
							checked={selected.has(p.id)}
							onchange={(e) => toggleSelected(p.id, e.currentTarget.checked)}
							class="h-4 w-4 rounded border-input"
							aria-label={m.admin_plugins_select_aria({ name: p.name })}
						/>
					</label>
					<div class="min-w-0 space-y-1">
						<div class="flex items-center gap-2 flex-wrap">
							<a href={`/plugins/${p.id}`} class="text-sm font-medium truncate hover:text-primary">{p.name}</a>
							<Badge
								variant={p.status === 'approved' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'}
								class="text-[10px]"
							>
								{p.status}
							</Badge>
							{#if p.featured}
								<Badge variant="default" class="text-[10px] gap-1"
									><Pin class="h-2.5 w-2.5" />{m.admin_plugins_featured()}</Badge
								>
							{/if}
							{#if p.verified}
								<Badge
									variant="default"
									class="text-[10px] gap-1 bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/20"
									><ShieldCheck class="h-2.5 w-2.5" />{m.admin_plugins_verified()}</Badge
								>
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
					<div class="col-span-2 hidden flex-wrap justify-end gap-2 border-t border-border/60 pt-3 sm:flex">
						{#each actions as action (action.id)}
							{@const Icon = action.icon}
							<Button
								variant="outline"
								size="sm"
								class={`${actionButtonClass} ${action.color ?? ''}`}
								onclick={action.run}
								disabled={busy[p.id]}
								title={action.title}
								aria-pressed={action.pressed}
							>
								<Icon /><span class="truncate">{action.label}</span>
							</Button>
						{/each}
					</div>
					<div class="col-span-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 sm:hidden">
						<Button
							variant="outline"
							size="sm"
							class={actionButtonClass}
							onclick={() => (webhookTarget = p)}
							disabled={busy[p.id]}
							title={m.admin_plugins_webhook_manage()}
						>
							<Webhook /><span>Webhook</span>
						</Button>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="outline" size="sm" class={actionButtonClass} disabled={busy[p.id]}>
										<MoreHorizontal /><span>{m.admin_plugins_actions()}</span>
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Portal>
								<DropdownMenu.Content
									align="end"
									sideOffset={6}
									class="z-50 max-h-[70dvh] w-60 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-xl outline-none"
								>
									{#each menuActions as action, i (action.id)}
										{@const Icon = action.icon}
										{#if action.danger && (i === 0 || !menuActions[i - 1].danger)}
											<DropdownMenu.Separator class="my-1 h-px bg-border" />
										{/if}
										<DropdownMenu.Item
											onSelect={action.run}
											disabled={busy[p.id]}
											class={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm outline-none data-highlighted:bg-accent data-disabled:opacity-50 ${action.danger ? 'text-destructive' : ''}`}
										>
											<Icon class="h-4 w-4 shrink-0" /><span class="flex-1"
												>{action.pressed === undefined ? action.label : action.title}</span
											>
										</DropdownMenu.Item>
									{/each}
								</DropdownMenu.Content>
							</DropdownMenu.Portal>
						</DropdownMenu.Root>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>

{#if webhookTarget}
	<PluginWebhookDialog plugin={webhookTarget} onClose={() => (webhookTarget = null)} />
{/if}

{#if deleteTarget}
	<ConfirmDialog
		open={deleteTarget !== null}
		title={m.admin_plugins_delete()}
		description={m.admin_plugins_confirm_delete({ name: deleteTarget.name })}
		confirmWord={deleteTarget.id}
		confirmLabel={m.admin_plugins_delete()}
		busy={busy[deleteTarget.id] ?? false}
		onConfirm={confirmRemove}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}

<ConfirmDialog
	bind:open={bulkDeleteOpen}
	title={m.admin_plugins_bulk_delete_title({ count: selected.size })}
	description={m.admin_plugins_bulk_delete_confirm({ count: selected.size })}
	confirmWord="DELETE"
	confirmLabel={m.admin_plugins_delete()}
	busy={bulkBusy}
	onConfirm={() => runBulk('delete')}
/>
