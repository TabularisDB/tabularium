<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import HardDrive from '@lucide/svelte/icons/hard-drive'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Package from '@lucide/svelte/icons/package'
	import Download from '@lucide/svelte/icons/download'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Power from '@lucide/svelte/icons/power'
	import PowerOff from '@lucide/svelte/icons/power-off'
	import ChevronDown from '@lucide/svelte/icons/chevron-down'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import Lock from '@lucide/svelte/icons/lock'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'

	type CacheState = {
		driver: 'off' | 'memory' | 'redis'
		configuredDriver: string | null
		defaultDriver: 'off' | 'memory' | 'redis'
		redisUrlConfigured: boolean
		redisUrlMasked: string | null
	}

	type StorageState = {
		driver: 'off' | 'disk' | 's3'
		configuredDriver: string | null
		s3: {
			bucket: string | null
			region: string | null
			endpoint: string | null
			publicBaseUrl: string | null
			accessKeyConfigured: boolean
			secretKeyConfigured: boolean
		}
	}

	let cacheState = $state<CacheState | null>(null)
	let driver = $state<'off' | 'memory' | 'redis'>('memory')
	let redisUrl = $state('')
	let saving = $state(false)
	let loading = $state(true)

	type NavContribution = { id: string; href: string; labelKey: string; icon: string; order?: number }
	type RouteContribution = { path: string; componentImport: string }
	type ContributionBundle = {
		adminNav: NavContribution[]
		userNav: NavContribution[]
		adminRoutes: RouteContribution[]
		userRoutes: RouteContribution[]
		publicRoutes: RouteContribution[]
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
	}

	type PluginsState = {
		installed: PluginRow[]
		enabled: string[]
		required: { all: string[]; core: string[] }
		knownIds: string[]
		loaded: string[]
	}

	let pluginsState = $state<PluginsState | null>(null)
	let pluginsLoading = $state(true)
	let installId = $state('')
	let installing = $state(false)
	let pluginBusy = $state<Record<string, boolean>>({})
	let expanded = $state<Record<string, boolean>>({})
	let confirmDeleteId = $state<string | null>(null)

	function formatRelative(ts: number): string {
		const diff = Date.now() - ts
		const seconds = Math.floor(diff / 1000)
		if (seconds < 5) return 'just now'
		if (seconds < 60) return `${seconds}s ago`
		const minutes = Math.floor(seconds / 60)
		if (minutes < 60) return `${minutes}m ago`
		const hours = Math.floor(minutes / 60)
		if (hours < 24) return `${hours}h ago`
		const days = Math.floor(hours / 24)
		if (days < 30) return `${days}d ago`
		const months = Math.floor(days / 30)
		if (months < 12) return `${months}mo ago`
		const years = Math.floor(months / 12)
		return `${years}y ago`
	}

	function sourceVariant(source: 'workspace' | 'bundled' | 'registry'): 'default' | 'secondary' {
		return source === 'workspace' ? 'secondary' : 'default'
	}

	function extractError(error: unknown, fallback: string): string {
		const e = error as { value?: unknown; status?: number } | null
		if (!e) return fallback
		if (typeof e.value === 'string') return e.value
		if (e.value && typeof e.value === 'object' && 'error' in (e.value as Record<string, unknown>)) {
			const v = (e.value as { error?: unknown }).error
			if (typeof v === 'string') return v
		}
		return `${fallback} (${e.status ?? 'unknown'})`
	}

	const knownNotInstalled = $derived.by(() => {
		if (!pluginsState) return [] as string[]
		const installedIds = new Set(pluginsState.installed.map((p) => p.id))
		return pluginsState.knownIds.filter((id) => !installedIds.has(id))
	})

	let storageState = $state<StorageState | null>(null)
	let storageDriver = $state<'off' | 'disk' | 's3'>('disk')
	let s3Bucket = $state('')
	let s3Region = $state('')
	let s3Endpoint = $state('')
	let s3PublicBase = $state('')
	let s3AccessKey = $state('')
	let s3SecretKey = $state('')
	let storageSaving = $state(false)
	let storageLoading = $state(true)

	async function load() {
		try {
			const { data, error } = await eden.api.admin.infra.cache.get()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			cacheState = data as CacheState
			driver = cacheState.driver
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_cache_load_failed())
		} finally {
			loading = false
		}
	}

	async function loadStorage() {
		try {
			const { data, error } = await eden.api.admin.infra.storage.get()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			storageState = data as StorageState
			storageDriver = storageState.driver
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_storage_load_failed())
		} finally {
			storageLoading = false
		}
	}

	async function saveStorage() {
		storageSaving = true
		try {
			const body: { driver: typeof storageDriver; s3?: Record<string, string> } = { driver: storageDriver }
			if (storageDriver === 's3') {
				const s3: Record<string, string> = {}
				if (s3Bucket) s3.bucket = s3Bucket
				if (s3Region) s3.region = s3Region
				if (s3Endpoint) s3.endpoint = s3Endpoint
				if (s3PublicBase) s3.publicBaseUrl = s3PublicBase
				if (s3AccessKey) s3.accessKey = s3AccessKey
				if (s3SecretKey) s3.secretKey = s3SecretKey
				if (Object.keys(s3).length) body.s3 = s3
			}
			const { error } = await eden.api.admin.infra.storage.put(body)
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_infra_storage_reconfigured({ driver: storageDriver }))
			s3AccessKey = ''
			s3SecretKey = ''
			await loadStorage()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_storage_failed())
		} finally {
			storageSaving = false
		}
	}

	async function loadPlugins() {
		try {
			const { data, error } = await eden.api.admin.infra.plugins.get()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			pluginsState = data as PluginsState
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load plugin host state')
		} finally {
			pluginsLoading = false
		}
	}

	async function installPlugin(id: string) {
		const trimmed = id.trim()
		if (!trimmed) {
			toast.warning('Plugin id is required')
			return
		}
		installing = true
		pluginBusy = { ...pluginBusy, [trimmed]: true }
		try {
			const { data, error } = await eden.api.admin.infra.plugins.post({ id: trimmed })
			if (error) {
				if (error.status === 501) {
					toast.warning(extractError(error, 'Registry source not implemented'))
					return
				}
				throw new Error(extractError(error, 'Install failed'))
			}
			const source = (data as { source?: string })?.source ?? 'workspace'
			toast.success(`Installed ${trimmed} (${source})`)
			installId = ''
			await loadPlugins()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Install failed')
		} finally {
			installing = false
			pluginBusy = { ...pluginBusy, [trimmed]: false }
		}
	}

	async function enablePlugin(id: string) {
		pluginBusy = { ...pluginBusy, [id]: true }
		try {
			const { error } = await eden.api.admin.infra.plugins({ id }).enable.put()
			if (error) throw new Error(extractError(error, 'Enable failed'))
			toast.success(`Enabled ${id}`)
			await loadPlugins()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Enable failed')
		} finally {
			pluginBusy = { ...pluginBusy, [id]: false }
		}
	}

	async function disablePlugin(id: string) {
		pluginBusy = { ...pluginBusy, [id]: true }
		try {
			const { error } = await eden.api.admin.infra.plugins({ id }).disable.put()
			if (error) throw new Error(extractError(error, 'Disable failed'))
			toast.success(`Disabled ${id}`)
			await loadPlugins()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Disable failed')
		} finally {
			pluginBusy = { ...pluginBusy, [id]: false }
		}
	}

	async function deletePlugin(id: string) {
		pluginBusy = { ...pluginBusy, [id]: true }
		try {
			const { error } = await eden.api.admin.infra.plugins({ id }).delete()
			if (error) throw new Error(extractError(error, 'Uninstall failed'))
			toast.success(`Uninstalled ${id}`)
			confirmDeleteId = null
			await loadPlugins()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Uninstall failed')
		} finally {
			pluginBusy = { ...pluginBusy, [id]: false }
		}
	}

	function toggleExpand(id: string) {
		expanded = { ...expanded, [id]: !expanded[id] }
	}

	onMount(() => {
		load()
		loadStorage()
		loadPlugins()
	})

	async function save() {
		saving = true
		try {
			const body: { driver: typeof driver; redisUrl?: string } = { driver }
			if (driver === 'redis' && redisUrl.trim()) body.redisUrl = redisUrl.trim()
			const { error } = await eden.api.admin.infra.cache.put(body)
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_infra_cache_reconfigured({ driver }))
			redisUrl = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_cache_failed())
		} finally {
			saving = false
		}
	}
</script>

<AdminPageHeader title={m.admin_infra_title()} subtitle={m.admin_infra_subtitle()} />

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_infra_cache()}</CardTitle>
		<CardDescription>
			{@html m.admin_infra_cache_subtitle_html()}
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if cacheState}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-muted-foreground">{m.admin_infra_active()}</span>
				<Badge variant={cacheState.driver === 'redis' ? 'default' : 'secondary'}>{cacheState.driver}</Badge>
				{#if cacheState.configuredDriver === null}
					<span class="text-xs text-muted-foreground">{m.admin_infra_from_env()}</span>
				{/if}
			</div>

			<div class="grid gap-2 max-w-xs">
				<Label for="driver">{m.admin_infra_driver()}</Label>
				<Select id="driver" bind:value={driver}>
					<option value="off">{m.admin_infra_cache_off()}</option>
					<option value="memory">{m.admin_infra_cache_memory()}</option>
					<option value="redis">{m.admin_infra_cache_redis()}</option>
				</Select>
			</div>

			{#if driver === 'redis'}
				<div class="grid gap-2 max-w-md">
					<Label for="redis-url">{m.admin_infra_redis_url()}</Label>
					<Input
						id="redis-url"
						type="password"
						placeholder={cacheState.redisUrlConfigured
							? (cacheState.redisUrlMasked ?? 'redis://… (configured)')
							: 'redis://user:pass@host:6379'}
						bind:value={redisUrl}
					/>
					<p class="text-xs text-muted-foreground">
						{m.admin_infra_redis_url_note()}
					</p>
				</div>
			{/if}

			<div class="flex justify-end">
				<Button size="sm" onclick={save} disabled={saving}>
					<Save class="h-3.5 w-3.5" />
					{saving ? m.common_saving() : m.common_apply()}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			<HardDrive class="h-4 w-4" />
			{m.admin_infra_storage()}
		</CardTitle>
		<CardDescription>
			{@html m.admin_infra_storage_subtitle_html()}
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if storageLoading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if storageState}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-muted-foreground">{m.admin_infra_active()}</span>
				<Badge variant={storageState.driver === 's3' ? 'default' : 'secondary'}>{storageState.driver}</Badge>
			</div>

			<div class="grid gap-2 max-w-xs">
				<Label for="storage-driver">{m.admin_infra_driver()}</Label>
				<Select id="storage-driver" bind:value={storageDriver}>
					<option value="off">{m.admin_infra_storage_off()}</option>
					<option value="disk">{m.admin_infra_storage_disk()}</option>
					<option value="s3">{m.admin_infra_storage_s3()}</option>
				</Select>
			</div>

			{#if storageDriver === 's3'}
				<div class="grid gap-2 max-w-md">
					<Label for="s3-bucket">{m.admin_infra_s3_bucket()}</Label>
					<Input id="s3-bucket" bind:value={s3Bucket} placeholder={storageState.s3.bucket ?? 'my-bucket'} />
				</div>
				<div class="grid grid-cols-2 gap-3 max-w-md">
					<div class="grid gap-2">
						<Label for="s3-region">{m.admin_infra_s3_region()}</Label>
						<Input id="s3-region" bind:value={s3Region} placeholder={storageState.s3.region ?? 'us-east-1'} />
					</div>
					<div class="grid gap-2">
						<Label for="s3-endpoint">{m.admin_infra_s3_endpoint()}</Label>
						<Input id="s3-endpoint" bind:value={s3Endpoint} placeholder={storageState.s3.endpoint ?? 'auto'} />
					</div>
				</div>
				<div class="grid gap-2 max-w-md">
					<Label for="s3-base">{m.admin_infra_s3_public_base()}</Label>
					<Input
						id="s3-base"
						bind:value={s3PublicBase}
						placeholder={storageState.s3.publicBaseUrl ?? 'https://cdn.example.com'}
					/>
				</div>
				<div class="grid grid-cols-2 gap-3 max-w-md">
					<div class="grid gap-2">
						<Label for="s3-ak">{m.admin_infra_s3_access_key()}</Label>
						<Input
							id="s3-ak"
							type="password"
							bind:value={s3AccessKey}
							placeholder={storageState.s3.accessKeyConfigured ? '••••' : 'AKIA…'}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="s3-sk">{m.admin_infra_s3_secret_key()}</Label>
						<Input
							id="s3-sk"
							type="password"
							bind:value={s3SecretKey}
							placeholder={storageState.s3.secretKeyConfigured ? '••••' : ''}
						/>
					</div>
				</div>
			{/if}

			<div class="flex justify-end">
				<Button size="sm" onclick={saveStorage} disabled={storageSaving}>
					<Save class="h-3.5 w-3.5" />
					{storageSaving ? m.common_saving() : m.common_apply()}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>

<div id="plugins"></div>
<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			<Boxes class="h-4 w-4" />
			Plugins
		</CardTitle>
		<CardDescription>
			Install, enable, or remove plugins resolved by the kernel installer (workspace &gt; bundled &gt; registry).
			Changes to enabled state take effect on next boot.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-5">
		{#if pluginsLoading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if pluginsState}
			<!-- Install bar -->
			<div class="flex flex-col gap-2 sm:flex-row sm:items-end rounded-md border border-border bg-muted/30 p-3">
				<div class="grid gap-1.5 flex-1">
					<Label for="install-id" class="text-xs">Plugin id</Label>
					<Input
						id="install-id"
						placeholder="e.g. discord-notifier"
						bind:value={installId}
						class="font-mono"
						onkeydown={(e: KeyboardEvent) => {
							if (e.key === 'Enter' && !installing) installPlugin(installId)
						}}
					/>
				</div>
				<Button size="sm" onclick={() => installPlugin(installId)} disabled={installing || !installId.trim()}>
					<Download class="h-3.5 w-3.5" />
					{installing ? 'Installing…' : 'Install'}
				</Button>
			</div>

			<!-- Installed plugin cards -->
			<div class="space-y-3">
				<h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Installed plugins ({pluginsState.installed.length})
				</h3>
				{#if pluginsState.installed.length === 0}
					<p class="text-sm text-muted-foreground italic">No plugins installed yet.</p>
				{:else}
					{#each pluginsState.installed as p (p.id)}
						{@const busy = pluginBusy[p.id] === true}
						{@const isCore = pluginsState.required.core.includes(p.id)}
						{@const cannotDisable = p.required}
						<div class="rounded-md border border-border bg-card p-4 space-y-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1 space-y-2">
									<div class="flex flex-wrap items-center gap-2">
										<Package class="h-4 w-4 shrink-0 text-muted-foreground" />
										<span class="font-mono font-semibold text-sm">{p.id}</span>
										<span class="text-xs font-mono text-muted-foreground">v{p.version}</span>
										<Badge variant={sourceVariant(p.source)}>{p.source}</Badge>
									</div>
									<div class="flex flex-wrap items-center gap-1.5 text-xs">
										{#if p.loaded}
											<Badge variant="default">loaded</Badge>
										{:else}
											<Badge variant="secondary">not loaded</Badge>
										{/if}
										{#if p.enabled}
											<Badge variant="secondary">enabled</Badge>
										{:else}
											<Badge variant="secondary" class="opacity-60">disabled</Badge>
										{/if}
										{#if p.required}
											<Badge variant="default" class="gap-1">
												<Lock class="h-3 w-3" />
												{isCore ? 'core-required' : 'required'}
											</Badge>
										{/if}
									</div>
								</div>
								<div class="flex shrink-0 items-center gap-1.5">
									{#if p.enabled}
										<Button
											variant="outline"
											size="sm"
											onclick={() => disablePlugin(p.id)}
											disabled={busy || cannotDisable}
											title={cannotDisable
												? isCore
													? 'required by kernel — cannot disable'
													: 'operator-required — cannot disable'
												: 'Disable plugin'}
										>
											<PowerOff class="h-3.5 w-3.5" />
											Disable
										</Button>
									{:else}
										<Button
											variant="outline"
											size="sm"
											onclick={() => enablePlugin(p.id)}
											disabled={busy}
											title="Enable plugin"
										>
											<Power class="h-3.5 w-3.5" />
											Enable
										</Button>
									{/if}
									<Button
										variant="destructive"
										size="sm"
										onclick={() => (confirmDeleteId = p.id)}
										disabled={busy || cannotDisable}
										title={cannotDisable
											? isCore
												? 'required by kernel — cannot uninstall'
												: 'operator-required — cannot uninstall'
											: 'Uninstall plugin'}
									>
										<Trash2 class="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>

							<button
								type="button"
								class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
								onclick={() => toggleExpand(p.id)}
							>
								{#if expanded[p.id]}
									<ChevronDown class="h-3 w-3" />
								{:else}
									<ChevronRight class="h-3 w-3" />
								{/if}
								{p.contributionsCount} contribution{p.contributionsCount === 1 ? '' : 's'}
							</button>

							{#if expanded[p.id]}
								<div class="rounded-sm bg-muted/40 p-3 space-y-2 text-xs">
									{#if p.contributionsCount === 0}
										<p class="text-muted-foreground italic">No contributions registered.</p>
									{:else}
										{#if p.contributions.adminNav.length}
											<div>
												<div class="font-medium mb-1">Admin nav</div>
												<ul class="space-y-0.5 pl-3">
													{#each p.contributions.adminNav as n}
														<li class="font-mono text-muted-foreground">
															{n.id} <span class="text-foreground/70">→ {n.href}</span>
														</li>
													{/each}
												</ul>
											</div>
										{/if}
										{#if p.contributions.userNav.length}
											<div>
												<div class="font-medium mb-1">User settings nav</div>
												<ul class="space-y-0.5 pl-3">
													{#each p.contributions.userNav as n}
														<li class="font-mono text-muted-foreground">
															{n.id} <span class="text-foreground/70">→ {n.href}</span>
														</li>
													{/each}
												</ul>
											</div>
										{/if}
										{#if p.contributions.adminRoutes.length}
											<div>
												<div class="font-medium mb-1">Admin routes</div>
												<ul class="space-y-0.5 pl-3">
													{#each p.contributions.adminRoutes as r}
														<li class="font-mono text-muted-foreground">{r.path}</li>
													{/each}
												</ul>
											</div>
										{/if}
										{#if p.contributions.userRoutes.length}
											<div>
												<div class="font-medium mb-1">User routes</div>
												<ul class="space-y-0.5 pl-3">
													{#each p.contributions.userRoutes as r}
														<li class="font-mono text-muted-foreground">{r.path}</li>
													{/each}
												</ul>
											</div>
										{/if}
										{#if p.contributions.publicRoutes.length}
											<div>
												<div class="font-medium mb-1">Public routes</div>
												<ul class="space-y-0.5 pl-3">
													{#each p.contributions.publicRoutes as r}
														<li class="font-mono text-muted-foreground">{r.path}</li>
													{/each}
												</ul>
											</div>
										{/if}
									{/if}
								</div>
							{/if}

							<div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1 border-t border-border/60">
								<code class="font-mono truncate" title={p.entryPoint}>{p.entryPoint}</code>
								<span class="shrink-0">Installed {formatRelative(p.installedAt)}</span>
							</div>

							{#if confirmDeleteId === p.id}
								<div class="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
									<p class="text-sm">
										Uninstall <code class="font-mono">{p.id}</code>? This drops the install record and removes it from the
										enabled list.
									</p>
									<div class="flex justify-end gap-2">
										<Button variant="ghost" size="sm" onclick={() => (confirmDeleteId = null)} disabled={busy}>
											Cancel
										</Button>
										<Button variant="destructive" size="sm" onclick={() => deletePlugin(p.id)} disabled={busy}>
											{busy ? 'Removing…' : 'Confirm uninstall'}
										</Button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Available to install -->
			{#if knownNotInstalled.length > 0}
				<div class="space-y-3">
					<h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Available to install ({knownNotInstalled.length})
					</h3>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each knownNotInstalled as id (id)}
							{@const busy = pluginBusy[id] === true}
							<div
								class="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/70 bg-muted/20 p-3"
							>
								<div class="flex items-center gap-2 min-w-0">
									<Package class="h-4 w-4 shrink-0 text-muted-foreground/70" />
									<span class="font-mono text-sm truncate">{id}</span>
								</div>
								<Button variant="outline" size="sm" onclick={() => installPlugin(id)} disabled={busy || installing}>
									<Download class="h-3.5 w-3.5" />
									{busy ? '…' : 'Install'}
								</Button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<details class="text-xs text-muted-foreground pt-2">
				<summary class="cursor-pointer select-none">Loader state</summary>
				<div class="mt-2 space-y-1 pl-2">
					<div>
						<span class="font-medium">Enabled list:</span>
						<code>{pluginsState.enabled.join(', ') || '—'}</code>
					</div>
					<div>
						<span class="font-medium">Required (all):</span>
						<code>{pluginsState.required.all.join(', ') || '—'}</code>
					</div>
					<div>
						<span class="font-medium">Required (core):</span>
						<code>{pluginsState.required.core.join(', ') || '—'}</code>
					</div>
					<div>
						<span class="font-medium">Known to installer:</span>
						<code>{pluginsState.knownIds.join(', ') || '—'}</code>
					</div>
				</div>
			</details>
		{/if}
	</CardContent>
</Card>
