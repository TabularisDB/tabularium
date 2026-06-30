<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import { Dialog } from 'bits-ui'
	import { marked } from 'marked'
	import { getLocale } from '$lib/paraglide/runtime'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Package from '@lucide/svelte/icons/package'
	import Download from '@lucide/svelte/icons/download'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Power from '@lucide/svelte/icons/power'
	import PowerOff from '@lucide/svelte/icons/power-off'
	import Lock from '@lucide/svelte/icons/lock'
	import RotateCw from '@lucide/svelte/icons/rotate-cw'
	import Search from '@lucide/svelte/icons/search'
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import Globe from '@lucide/svelte/icons/globe'
	import Info from '@lucide/svelte/icons/info'
	import X from '@lucide/svelte/icons/x'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	type ContributionBundle = {
		adminNav: { id: string; href: string; labelKey: string }[]
		userNav: { id: string; href: string; labelKey: string }[]
		adminRoutes: { path: string; componentImport: string }[]
		userRoutes: { path: string; componentImport: string }[]
		publicRoutes: { path: string; componentImport: string }[]
	}

	type PluginRow = {
		id: string
		version: string
		source: 'workspace' | 'bundled' | 'registry'
		entryPoint: string
		installedAt: number
		loaded: boolean
		enabled: boolean
		required: boolean
		contributionsCount: number
		contributions: ContributionBundle
		requires: string[]
		requiredBy: string[]
		description: string | null
		readme: string | null
	}

	type AvailablePlugin = {
		id: string
		version: string | null
		source: 'workspace' | 'bundled' | null
		description: string | null
	}

	type PluginsState = {
		installed: PluginRow[]
		enabled: string[]
		required: { all: string[]; core: string[] }
		knownIds: string[]
		loaded: string[]
		available: AvailablePlugin[]
	}

	let pluginState = $state<PluginsState | null>(null)
	let loading = $state(true)
	let activeTab = $state<'installed' | 'available' | 'registry'>('installed')
	let search = $state('')
	let busy = $state<Record<string, boolean>>({})
	let restartRequired = $state(false)
	let restarting = $state(false)
	let confirmDeleteId = $state<string | null>(null)
	let installId = $state('')
	let detailsId = $state<string | null>(null)
	const detailsPlugin = $derived(
		detailsId ? (pluginState?.installed.find((p) => p.id === detailsId) ?? null) : null,
	)

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.infra.plugins.get({ query: { locale: getLocale() } })
			if (error) throw error
			pluginState = data as PluginsState
		} catch (e) {
			toast.error(extractError(e, m.admin_infra_plugins_load_failed()))
		} finally {
			loading = false
		}
	}

	function extractError(error: unknown, fallback: string): string {
		if (typeof error === 'string') return error
		if (error && typeof error === 'object' && 'value' in error) {
			const v = (error as { value?: unknown }).value
			if (typeof v === 'string') return v
			if (v && typeof v === 'object' && 'error' in v && typeof (v as { error: unknown }).error === 'string')
				return (v as { error: string }).error
		}
		if (error instanceof Error) return error.message
		return fallback
	}

	onMount(load)

	const installed = $derived(pluginState?.installed ?? [])
	const available = $derived(pluginState?.available ?? [])
	const counts = $derived({
		installed: installed.length,
		available: available.length,
		registry: 0,
		enabled: installed.filter((p) => p.enabled).length,
		loaded: installed.filter((p) => p.loaded).length,
	})

	function matchesSearch(text: string): boolean {
		if (!search.trim()) return true
		return text.toLowerCase().includes(search.trim().toLowerCase())
	}

	const filteredInstalled = $derived(
		installed.filter((p) => matchesSearch(`${p.id} ${p.version} ${p.source} ${p.requires.join(' ')}`)),
	)
	const filteredAvailable = $derived(
		available.filter((p) => matchesSearch(`${p.id} ${p.version ?? ''} ${p.description ?? ''}`)),
	)

	async function enablePlugin(id: string) {
		busy[id] = true
		try {
			const { error } = await eden.api.admin.infra.plugins({ id }).enable.put()
			if (error) throw new Error(extractError(error, m.admin_infra_plugins_enable_failed()))
			toast.success(m.admin_infra_plugins_enabled_toast({ id }))
			restartRequired = true
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_plugins_enable_failed())
		} finally {
			busy[id] = false
		}
	}

	async function disablePlugin(id: string) {
		busy[id] = true
		try {
			const { error } = await eden.api.admin.infra.plugins({ id }).disable.put()
			if (error) {
				// Surface dependency blockers verbatim — the backend computes which
				// plugins still require this one and the message is already actionable.
				throw new Error(extractError(error, m.admin_infra_plugins_disable_failed()))
			}
			toast.success(m.admin_infra_plugins_disabled_toast({ id }))
			restartRequired = true
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_plugins_disable_failed(), {
				duration: 6000,
			})
		} finally {
			busy[id] = false
		}
	}

	async function installPlugin(id: string) {
		if (!id.trim()) return
		busy[id] = true
		try {
			const { error } = await eden.api.admin.infra.plugins.post({ id: id.trim() })
			if (error) throw new Error(extractError(error, m.admin_infra_plugins_install_failed()))
			toast.success(m.admin_infra_plugins_installed_toast({ id }))
			restartRequired = true
			installId = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_plugins_install_failed())
		} finally {
			busy[id] = false
		}
	}

	async function uninstallPlugin(id: string) {
		busy[id] = true
		try {
			const { error } = await eden.api.admin.infra.plugins({ id }).delete()
			if (error) throw new Error(extractError(error, m.admin_infra_plugins_uninstall_failed()))
			toast.success(m.admin_infra_plugins_uninstalled_toast({ id }))
			restartRequired = true
			confirmDeleteId = null
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_plugins_uninstall_failed())
		} finally {
			busy[id] = false
		}
	}

	async function restartApi() {
		restarting = true
		try {
			const { error } = await eden.api.admin.infra.restart.post()
			if (error) throw new Error(extractError(error, m.admin_infra_plugins_restart_failed()))
			toast.info(m.admin_infra_plugins_restarting_toast())
			restartRequired = false
			// Poll /api/init/status until it comes back up.
			const deadline = Date.now() + 30_000
			while (Date.now() < deadline) {
				await new Promise((r) => setTimeout(r, 500))
				try {
					const res = await fetch('/api/init/status', { cache: 'no-store' })
					if (res.ok) break
				} catch {
					// expected during the restart gap
				}
			}
			toast.success(m.admin_infra_plugins_restarted_toast())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_plugins_restart_failed())
		} finally {
			restarting = false
		}
	}

	function sourceBadge(s: 'workspace' | 'bundled' | 'registry' | null): 'default' | 'secondary' | 'outline' {
		return s === 'workspace' ? 'default' : s === 'bundled' ? 'secondary' : 'outline'
	}

	function formatRelative(ts: number): string {
		const s = Math.floor((Date.now() - ts) / 1000)
		if (s < 60) return `${s}s`
		const min = Math.floor(s / 60)
		if (min < 60) return `${min}m`
		const h = Math.floor(min / 60)
		if (h < 24) return `${h}h`
		return `${Math.floor(h / 24)}d`
	}
</script>

<AdminPageHeader title={m.admin_infra_plugins_title()} subtitle={m.admin_infra_plugins_subtitle()} icon={Boxes}>
	{#snippet actions()}
		{#if restartRequired}
			<Button onclick={restartApi} disabled={restarting} variant="default" size="sm">
				<RotateCw class={`h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`} />
				{restarting ? m.admin_infra_plugins_restarting() : m.admin_infra_plugins_restart_now()}
			</Button>
		{/if}
	{/snippet}
</AdminPageHeader>

{#if restartRequired && !restarting}
	<div
		class="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 flex items-center justify-between gap-3 text-sm"
	>
		<div class="flex items-center gap-3 min-w-0">
			<RotateCw class="h-4 w-4 text-warning shrink-0" />
			<span class="text-foreground truncate">{m.admin_infra_plugins_restart_banner()}</span>
		</div>
		<Button size="sm" variant="outline" onclick={restartApi}>{m.admin_infra_plugins_restart_now()}</Button>
	</div>
{/if}

<!-- Status grid -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
	<Card>
		<CardContent class="p-4 space-y-1">
			<div class="text-xs text-muted-foreground flex items-center gap-1.5">
				<Package class="h-3.5 w-3.5" />{m.admin_infra_plugins_stat_installed()}
			</div>
			<div class="text-2xl font-semibold tracking-tight">{counts.installed}</div>
		</CardContent>
	</Card>
	<Card>
		<CardContent class="p-4 space-y-1">
			<div class="text-xs text-muted-foreground flex items-center gap-1.5">
				<Power class="h-3.5 w-3.5" />{m.admin_infra_plugins_stat_enabled()}
			</div>
			<div class="text-2xl font-semibold tracking-tight">{counts.enabled}</div>
		</CardContent>
	</Card>
	<Card>
		<CardContent class="p-4 space-y-1">
			<div class="text-xs text-muted-foreground flex items-center gap-1.5">
				<Sparkles class="h-3.5 w-3.5" />{m.admin_infra_plugins_stat_loaded()}
			</div>
			<div class="text-2xl font-semibold tracking-tight">{counts.loaded}</div>
		</CardContent>
	</Card>
	<Card>
		<CardContent class="p-4 space-y-1">
			<div class="text-xs text-muted-foreground flex items-center gap-1.5">
				<Download class="h-3.5 w-3.5" />{m.admin_infra_plugins_stat_available()}
			</div>
			<div class="text-2xl font-semibold tracking-tight">{counts.available}</div>
		</CardContent>
	</Card>
</div>

<!-- Tabs + search -->
<div class="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
	<div class="inline-flex rounded-lg border border-border bg-background p-0.5 text-sm">
		<button
			type="button"
			onclick={() => (activeTab = 'installed')}
			class={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'installed' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
		>
			{m.admin_infra_plugins_tab_installed()} <span class="opacity-60">({counts.installed})</span>
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'available')}
			class={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'available' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
		>
			{m.admin_infra_plugins_tab_available()} <span class="opacity-60">({counts.available})</span>
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'registry')}
			class={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'registry' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
		>
			{m.admin_infra_plugins_tab_registry()}
		</button>
	</div>

	<div class="relative flex-1 max-w-md">
		<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
		<Input bind:value={search} placeholder={m.admin_infra_plugins_search_placeholder()} class="pl-9" />
	</div>
</div>

{#if loading}
	<div class="text-sm text-muted-foreground py-12 text-center">{m.common_loading()}</div>
{:else if activeTab === 'installed'}
	{#if filteredInstalled.length === 0}
		<div class="text-sm text-muted-foreground py-12 text-center">
			{search ? m.admin_infra_plugins_empty_search() : m.admin_infra_plugins_empty_installed()}
		</div>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{#each filteredInstalled as p (p.id)}
				<Card class={p.required ? 'border-primary/30' : ''}>
					<CardContent class="p-5 space-y-4">
						<div class="flex items-start justify-between gap-3">
							<button
								type="button"
								class="space-y-1 min-w-0 text-left flex-1 cursor-pointer group"
								onclick={() => (detailsId = p.id)}
								aria-label={m.admin_infra_plugins_open_details({ id: p.id })}
							>
								<div class="flex items-center gap-2 flex-wrap">
									<h3 class="text-base font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
										{p.id}
									</h3>
									<Badge variant="outline" class="text-[10px] font-mono">v{p.version}</Badge>
									<Badge variant={sourceBadge(p.source)} class="text-[10px] uppercase tracking-wider">
										{p.source}
									</Badge>
									<Info class="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
								</div>
								<div class="flex items-center gap-1.5 flex-wrap text-[11px]">
									{#if p.required}
										<Badge variant="default" class="text-[10px] uppercase tracking-wider gap-1">
											<Lock class="h-2.5 w-2.5" />{m.admin_infra_plugins_required_badge()}
										</Badge>
									{/if}
									{#if p.enabled}
										<Badge variant="secondary" class="text-[10px] uppercase tracking-wider">
											{m.admin_infra_plugins_enabled_badge()}
										</Badge>
									{:else}
										<Badge variant="outline" class="text-[10px] uppercase tracking-wider opacity-70">
											{m.admin_infra_plugins_disabled_badge()}
										</Badge>
									{/if}
									{#if p.loaded}
										<Badge variant="secondary" class="text-[10px] uppercase tracking-wider gap-1">
											<Sparkles class="h-2.5 w-2.5" />{m.admin_infra_plugins_loaded_badge()}
										</Badge>
									{/if}
								</div>
							</button>
							<div class="flex items-center gap-1 shrink-0">
								{#if p.enabled}
									<Button
										variant="outline"
										size="sm"
										onclick={() => disablePlugin(p.id)}
										disabled={busy[p.id] || p.required}
										title={p.required ? m.admin_infra_plugins_cannot_disable_required() : ''}
									>
										<PowerOff class="h-3.5 w-3.5" />{m.admin_infra_plugins_action_disable()}
									</Button>
								{:else}
									<Button variant="default" size="sm" onclick={() => enablePlugin(p.id)} disabled={busy[p.id]}>
										<Power class="h-3.5 w-3.5" />{m.admin_infra_plugins_action_enable()}
									</Button>
								{/if}
								{#if !p.required}
									{#if confirmDeleteId === p.id}
										<Button
											variant="destructive"
											size="sm"
											onclick={() => uninstallPlugin(p.id)}
											disabled={busy[p.id]}
										>
											{m.admin_infra_plugins_action_confirm_uninstall()}
										</Button>
										<Button variant="ghost" size="sm" onclick={() => (confirmDeleteId = null)}>
											{m.common_cancel()}
										</Button>
									{:else}
										<Button
											variant="ghost"
											size="icon"
											onclick={() => (confirmDeleteId = p.id)}
											disabled={busy[p.id]}
											title={m.admin_infra_plugins_action_uninstall()}
										>
											<Trash2 class="h-3.5 w-3.5" />
										</Button>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Dependencies -->
						{#if p.requires.length > 0 || p.requiredBy.length > 0}
							<div class="space-y-2">
								{#if p.requires.length > 0}
									<div class="flex items-start gap-2 text-xs">
										<span class="text-muted-foreground font-medium shrink-0 pt-0.5">
											{m.admin_infra_plugins_requires_label()}:
										</span>
										<div class="flex flex-wrap gap-1">
											{#each p.requires as dep (dep)}
												<span
													class="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-mono"
												>
													<ArrowRight class="h-2.5 w-2.5" />{dep}
												</span>
											{/each}
										</div>
									</div>
								{/if}
								{#if p.requiredBy.length > 0}
									<div class="flex items-start gap-2 text-xs">
										<span class="text-muted-foreground font-medium shrink-0 pt-0.5">
											{m.admin_infra_plugins_required_by_label()}:
										</span>
										<div class="flex flex-wrap gap-1">
											{#each p.requiredBy as dep (dep)}
												<span
													class="inline-flex items-center gap-1 rounded-md bg-warning/10 text-warning px-2 py-0.5 text-[11px] font-mono"
												>
													{dep}<ArrowRight class="h-2.5 w-2.5" />
												</span>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Contributions + meta -->
						<div class="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground border-t border-border pt-3">
							<div>
								<span class="opacity-60">{m.admin_infra_plugins_meta_contributions()}:</span>
								{p.contributionsCount}
							</div>
							<div>
								<span class="opacity-60">{m.admin_infra_plugins_meta_installed_ago()}:</span>
								{formatRelative(p.installedAt)}
							</div>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
{:else if activeTab === 'available'}
	{#if filteredAvailable.length === 0}
		<div class="text-sm text-muted-foreground py-12 text-center">
			{search ? m.admin_infra_plugins_empty_search() : m.admin_infra_plugins_empty_available()}
		</div>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{#each filteredAvailable as p (p.id)}
				<Card>
					<CardContent class="p-5 space-y-3">
						<div class="flex items-start justify-between gap-3">
							<div class="space-y-1 min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<h3 class="text-base font-semibold tracking-tight truncate">{p.id}</h3>
									{#if p.version}
										<Badge variant="outline" class="text-[10px] font-mono">v{p.version}</Badge>
									{/if}
									{#if p.source}
										<Badge variant={sourceBadge(p.source)} class="text-[10px] uppercase tracking-wider">
											{p.source}
										</Badge>
									{/if}
								</div>
								{#if p.description}
									<p class="text-xs text-muted-foreground">{p.description}</p>
								{/if}
							</div>
							<Button variant="default" size="sm" onclick={() => installPlugin(p.id)} disabled={busy[p.id]}>
								<Download class="h-3.5 w-3.5" />{m.admin_infra_plugins_action_install()}
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Install by id -->
	<Card>
		<CardContent class="p-5 space-y-3">
			<div class="space-y-1">
				<h3 class="text-sm font-semibold">{m.admin_infra_plugins_install_by_id_title()}</h3>
				<p class="text-xs text-muted-foreground">{m.admin_infra_plugins_install_by_id_hint()}</p>
			</div>
			<div class="flex gap-2">
				<Input bind:value={installId} placeholder="discord-notifier" class="flex-1" />
				<Button onclick={() => installPlugin(installId)} disabled={!installId.trim() || busy[installId]}>
					<Download class="h-3.5 w-3.5" />{m.admin_infra_plugins_action_install()}
				</Button>
			</div>
		</CardContent>
	</Card>
{:else if activeTab === 'registry'}
	<Card>
		<CardContent class="p-10 text-center space-y-3">
			<Globe class="h-10 w-10 text-muted-foreground mx-auto" />
			<h3 class="text-base font-semibold">{m.admin_infra_plugins_registry_title()}</h3>
			<p class="text-sm text-muted-foreground max-w-md mx-auto">{m.admin_infra_plugins_registry_subtitle()}</p>
			<Button href="https://registry.tabularium.wiki" variant="outline" size="sm" target="_blank" rel="noreferrer">
				{m.admin_infra_plugins_registry_visit()} →
			</Button>
		</CardContent>
	</Card>
{/if}

<!-- Plugin details modal -->
<Dialog.Root open={detailsPlugin !== null} onOpenChange={(o) => !o && (detailsId = null)}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-2xl focus:outline-none overflow-hidden flex flex-col"
		>
			{#if detailsPlugin}
				{@const p = detailsPlugin}
				<div class="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
					<div class="space-y-1 min-w-0">
						<Dialog.Title class="text-lg font-semibold tracking-tight flex items-center gap-2">
							<Boxes class="h-5 w-5 text-primary" />
							{p.id}
							<Badge variant="outline" class="text-[10px] font-mono">v{p.version}</Badge>
							<Badge variant={sourceBadge(p.source)} class="text-[10px] uppercase tracking-wider">
								{p.source}
							</Badge>
						</Dialog.Title>
						<Dialog.Description class="text-xs text-muted-foreground">
							{#if p.description}
								<span class="block">{p.description}</span>
							{/if}
							<span class="block font-mono truncate opacity-70">{p.entryPoint}</span>
						</Dialog.Description>
					</div>
					<Dialog.Close
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent shrink-0"
						aria-label={m.common_close()}
					>
						<X class="h-4 w-4" />
					</Dialog.Close>
				</div>

				<div class="overflow-y-auto p-6 space-y-6">
					<!-- Status badges -->
					<div class="flex items-center gap-1.5 flex-wrap">
						{#if p.required}
							<Badge variant="default" class="text-[10px] uppercase tracking-wider gap-1">
								<Lock class="h-2.5 w-2.5" />{m.admin_infra_plugins_required_badge()}
							</Badge>
						{/if}
						{#if p.enabled}
							<Badge variant="secondary" class="text-[10px] uppercase tracking-wider">
								{m.admin_infra_plugins_enabled_badge()}
							</Badge>
						{:else}
							<Badge variant="outline" class="text-[10px] uppercase tracking-wider opacity-70">
								{m.admin_infra_plugins_disabled_badge()}
							</Badge>
						{/if}
						{#if p.loaded}
							<Badge variant="secondary" class="text-[10px] uppercase tracking-wider gap-1">
								<Sparkles class="h-2.5 w-2.5" />{m.admin_infra_plugins_loaded_badge()}
							</Badge>
						{/if}
					</div>

					<!-- README -->
					{#if p.readme}
						<section class="space-y-2">
							<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{m.admin_infra_plugins_details_readme()}
							</h4>
							<div class="prose prose-sm dark:prose-invert max-w-none plugin-readme">
								{@html marked.parse(p.readme)}
							</div>
						</section>
					{/if}

					<!-- Dependencies -->
					{#if p.requires.length > 0 || p.requiredBy.length > 0}
						<section class="space-y-3">
							<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{m.admin_infra_plugins_details_dependencies()}
							</h4>
							{#if p.requires.length > 0}
								<div class="flex items-start gap-2 text-xs">
									<span class="text-muted-foreground font-medium shrink-0 pt-0.5 w-20">
										{m.admin_infra_plugins_requires_label()}:
									</span>
									<div class="flex flex-wrap gap-1">
										{#each p.requires as dep (dep)}
											<button
												type="button"
												onclick={() => (detailsId = dep)}
												class="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-2 py-0.5 text-[11px] font-mono transition-colors"
											>
												<ArrowRight class="h-2.5 w-2.5" />{dep}
											</button>
										{/each}
									</div>
								</div>
							{/if}
							{#if p.requiredBy.length > 0}
								<div class="flex items-start gap-2 text-xs">
									<span class="text-muted-foreground font-medium shrink-0 pt-0.5 w-20">
										{m.admin_infra_plugins_required_by_label()}:
									</span>
									<div class="flex flex-wrap gap-1">
										{#each p.requiredBy as dep (dep)}
											<button
												type="button"
												onclick={() => (detailsId = dep)}
												class="inline-flex items-center gap-1 rounded-md bg-warning/10 text-warning hover:bg-warning/20 px-2 py-0.5 text-[11px] font-mono transition-colors"
											>
												{dep}<ArrowRight class="h-2.5 w-2.5" />
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</section>
					{/if}

					<!-- Contributions -->
					<section class="space-y-3">
						<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{m.admin_infra_plugins_details_contributions()}
							<span class="text-foreground/60">({p.contributionsCount})</span>
						</h4>
						{#if p.contributionsCount === 0}
							<p class="text-xs text-muted-foreground">{m.admin_infra_plugins_details_no_contributions()}</p>
						{:else}
							<div class="space-y-3">
								{#if p.contributions.adminNav.length > 0}
									<div>
										<div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
											{m.admin_infra_plugins_details_admin_nav()}
										</div>
										<ul class="space-y-1">
											{#each p.contributions.adminNav as nav (nav.id)}
												<li class="text-xs flex items-center gap-2">
													<code class="font-mono text-foreground">{nav.id}</code>
													<span class="text-muted-foreground">→</span>
													<a href={nav.href} class="font-mono text-primary hover:underline">{nav.href}</a>
													<span class="text-muted-foreground text-[10px]">({nav.labelKey})</span>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
								{#if p.contributions.adminRoutes.length > 0}
									<div>
										<div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
											{m.admin_infra_plugins_details_admin_routes()}
										</div>
										<ul class="space-y-1">
											{#each p.contributions.adminRoutes as route (route.path)}
												<li class="text-xs flex items-center gap-2">
													<a href={route.path} class="font-mono text-primary hover:underline">{route.path}</a>
													<span class="text-muted-foreground text-[10px] font-mono truncate">
														← {route.componentImport}
													</span>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
								{#if p.contributions.userNav.length > 0}
									<div>
										<div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
											{m.admin_infra_plugins_details_user_nav()}
										</div>
										<ul class="space-y-1">
											{#each p.contributions.userNav as nav (nav.id)}
												<li class="text-xs flex items-center gap-2">
													<code class="font-mono text-foreground">{nav.id}</code>
													<span class="text-muted-foreground">→</span>
													<a href={nav.href} class="font-mono text-primary hover:underline">{nav.href}</a>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
								{#if p.contributions.userRoutes.length > 0}
									<div>
										<div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
											{m.admin_infra_plugins_details_user_routes()}
										</div>
										<ul class="space-y-1">
											{#each p.contributions.userRoutes as route (route.path)}
												<li class="text-xs">
													<a href={route.path} class="font-mono text-primary hover:underline">{route.path}</a>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
								{#if p.contributions.publicRoutes.length > 0}
									<div>
										<div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
											{m.admin_infra_plugins_details_public_routes()}
										</div>
										<ul class="space-y-1">
											{#each p.contributions.publicRoutes as route (route.path)}
												<li class="text-xs">
													<a href={route.path} class="font-mono text-primary hover:underline">{route.path}</a>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
					</section>

					<!-- Meta -->
					<section class="space-y-2 text-xs">
						<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{m.admin_infra_plugins_details_meta()}
						</h4>
						<dl class="grid grid-cols-[8rem_1fr] gap-y-1.5 text-xs">
							<dt class="text-muted-foreground">{m.admin_infra_plugins_details_meta_installed()}</dt>
							<dd class="font-mono">{new Date(p.installedAt).toLocaleString()}</dd>
							<dt class="text-muted-foreground">{m.admin_infra_plugins_details_meta_source()}</dt>
							<dd class="font-mono">{p.source}</dd>
							<dt class="text-muted-foreground">{m.admin_infra_plugins_details_meta_entry()}</dt>
							<dd class="font-mono truncate" title={p.entryPoint}>{p.entryPoint}</dd>
						</dl>
					</section>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
