<script lang="ts">
	import { page } from '$app/state'
	import { onMount, untrack } from 'svelte'
	import { goto } from '$app/navigation'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import UserRoundCog from '@lucide/svelte/icons/user-round-cog'
	import Boxes from '@lucide/svelte/icons/boxes'
	import BookOpen from '@lucide/svelte/icons/book-open'
	import Bug from '@lucide/svelte/icons/bug'
	import Shield from '@lucide/svelte/icons/shield'
	import Copy from '@lucide/svelte/icons/copy'
	import Star from '@lucide/svelte/icons/star'
	import Clock from '@lucide/svelte/icons/clock'
	import Download from '@lucide/svelte/icons/download'
	import Rocket from '@lucide/svelte/icons/rocket'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import Cpu from '@lucide/svelte/icons/cpu'
	import HardDrive from '@lucide/svelte/icons/hard-drive'
	import Languages from '@lucide/svelte/icons/languages'
	import Code2 from '@lucide/svelte/icons/code-2'
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import Check from '@lucide/svelte/icons/check'
	import Badge from '$components/ui/Badge.svelte'
	import Button from '$components/ui/Button.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { instanceInfo, buildInstallDeepLink } from '$lib/stores/instance-info.svelte'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { toast } from 'svelte-sonner'
	import type { Plugin, PluginStats } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	const slug = $derived(page.params.slug)
	const locale = $derived(i18n.current)

	let plugin = $state<Plugin | null>(null)
	let stats = $state<PluginStats | null>(null)
	let loading = $state(true)
	let notFound = $state(false)
	let deleting = $state(false)
	let refreshing = $state(false)
	let deleteOpen = $state(false)
	let activeScreenshot = $state<number | null>(null)
	let selectedPlatform = $state<string | null>(null)
	let copying = $state(false)

	async function load(currentLocale: Locale) {
		loading = true
		notFound = false
		try {
			const { data, error } = await eden.api.plugins({ slug }).get({ query: { locale: currentLocale } })
			if (error) {
				if (error.status === 404) notFound = true
				return
			}
			plugin = data as Plugin
		} finally {
			loading = false
		}
	}

	async function loadStats() {
		try {
			const { data, error } = await eden.api.plugins({ slug }).stats.get()
			if (error) return
			stats = data as PluginStats
		} catch {
			// silent
		}
	}

	onMount(() => {
		void load(locale)
		void loadStats()
		if (!instanceInfo.loaded) void instanceInfo.refresh()
	})

	$effect(() => {
		void slug
		void locale
		untrack(() => load(locale))
	})

	const sortedReleases = $derived(
		plugin?.releases ? [...plugin.releases].sort((a, b) => b.createdAt - a.createdAt) : [],
	)
	const isOwner = $derived(auth.user?.id === plugin?.ownerId)

	const baseUrl = $derived(typeof window === 'undefined' ? '' : window.location.origin)
	const latestRelease = $derived(sortedReleases[0] ?? null)

	const platformList = $derived.by(() => {
		if (!latestRelease) return [] as Array<{ key: string; url: string; size?: number; sha256?: string }>
		return Object.entries(latestRelease.assets).map(([key, entry]) => ({ key, ...entry }))
	})

	const installDeepLink = $derived.by(() => {
		if (!plugin || !latestRelease) return null
		const scheme = instanceInfo.pickSchemeForKind(null)
		if (!scheme) return null
		return {
			scheme,
			href: buildInstallDeepLink(scheme, {
				registry: baseUrl,
				slug: plugin.id,
				version: latestRelease.version,
			}),
		}
	})

	$effect(() => {
		if (platformList.length > 0 && !platformList.find((p) => p.key === selectedPlatform)) {
			untrack(() => {
				selectedPlatform = guessPlatform(platformList.map((p) => p.key))
			})
		}
	})

	function guessPlatform(available: string[]): string {
		if (typeof navigator === 'undefined') return available[0] ?? 'universal'
		const ua = navigator.userAgent.toLowerCase()
		const platform = (navigator.platform || '').toLowerCase()
		let os = 'linux'
		if (ua.includes('mac') || platform.includes('mac')) os = 'darwin'
		else if (ua.includes('win') || platform.includes('win')) os = 'win'
		let arch = 'x64'
		if (ua.includes('arm64') || ua.includes('aarch64')) arch = 'arm64'
		const key = `${os}-${arch}`
		if (available.includes(key)) return key
		if (available.includes(`${os}-x64`)) return `${os}-x64`
		if (available.includes('universal')) return 'universal'
		return available[0] ?? 'universal'
	}

	const installCommand = $derived.by(() => {
		if (!plugin) return ''
		const selected = platformList.find((p) => p.key === selectedPlatform)
		if (selected) return `curl -fLO "${selected.url}"`
		return `curl -fL "${baseUrl}/api/plugins/${plugin.id}/latest"`
	})

	async function copyInstall() {
		copying = true
		try {
			await navigator.clipboard.writeText(installCommand)
			toast.success(m.plugin_detail_copied())
		} catch {
			toast.error(m.plugin_detail_clipboard_unavailable())
		} finally {
			setTimeout(() => (copying = false), 1200)
		}
	}

	function openDelete() {
		deleteOpen = true
	}

	async function confirmDelete() {
		if (!plugin) return
		deleting = true
		try {
			const { error } = await eden.api.plugins({ slug: plugin.id }).delete()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.plugin_detail_deleted_toast())
			deleteOpen = false
			goto('/plugins')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.plugin_detail_delete_failed())
			deleting = false
		}
	}

	async function refreshFromForge() {
		if (!plugin || refreshing) return
		refreshing = true
		try {
			const { error } = await eden.api.plugins({ slug: plugin.id }).rehash.post({})
			if (error) {
				if (error.status === 429) {
					toast.error(m.plugin_detail_refresh_rate_limited())
				} else {
					throw new Error(
						typeof error.value === 'string'
							? error.value
							: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
					)
				}
				return
			}
			toast.success(m.plugin_detail_refresh_done())
			await load(locale)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.plugin_detail_refresh_failed())
		} finally {
			refreshing = false
		}
	}

	async function transferOwnership() {
		if (!plugin) return
		const newOwnerId = prompt(m.plugin_detail_transfer_prompt())
		if (!newOwnerId?.trim()) return
		const message = prompt(m.plugin_detail_transfer_message_prompt()) ?? undefined
		try {
			const { error } = await eden.api.plugins({ slug: plugin.id }).transfer.post({
				newOwnerId: newOwnerId.trim(),
				message: message?.trim() || undefined,
			})
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.plugin_detail_transfer_offered())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.plugin_detail_transfer_failed())
		}
	}

	function formatBytes(n: number | undefined | null): string {
		if (!n) return '—'
		if (n < 1024) return `${n} B`
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
		if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
		return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
	}

	function formatNumber(n: number | null | undefined): string {
		if (n === null || n === undefined) return '—'
		if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
		return String(n)
	}

	function formatRelative(ts: number | null | undefined): string {
		if (!ts) return '—'
		const diff = Date.now() - ts
		const minute = 60_000
		const hour = 60 * minute
		const day = 24 * hour
		const week = 7 * day
		const month = 30 * day
		const year = 365 * day
		if (diff < minute) return 'just now'
		if (diff < hour) return `${Math.floor(diff / minute)}m ago`
		if (diff < day) return `${Math.floor(diff / hour)}h ago`
		if (diff < week) return `${Math.floor(diff / day)}d ago`
		if (diff < month) return `${Math.floor(diff / week)}w ago`
		if (diff < year) return `${Math.floor(diff / month)}mo ago`
		return `${Math.floor(diff / year)}y ago`
	}

	function platformLabel(key: string): string {
		const parts = key.split('-')
		const os = parts[0]
		const arch = parts[1] ?? ''
		const osLabel = os === 'darwin' ? 'macOS' : os === 'win' ? 'Windows' : os === 'linux' ? 'Linux' : os
		if (key === 'universal') return 'Universal'
		return arch ? `${osLabel} · ${arch}` : osLabel
	}

	function providerKind(homepage: string): 'github' | 'gitlab' | 'codeberg' | 'gitea' {
		if (homepage.includes('github.com')) return 'github'
		if (homepage.includes('gitlab.com') || homepage.includes('gitlab.')) return 'gitlab'
		if (homepage.includes('codeberg.org')) return 'codeberg'
		return 'gitea'
	}

	function totalReleaseSize(release: typeof latestRelease): number {
		if (!release) return 0
		return Object.values(release.assets).reduce((acc, a) => acc + (a.size ?? 0), 0)
	}

	const ogImage = $derived(plugin?.iconUrl ?? `${baseUrl}/favicon.png`)
	const ogTitle = $derived(plugin ? `${plugin.name} — ${branding.name}` : branding.name)
	const ogDescription = $derived(plugin?.description ?? '')
	const canonicalUrl = $derived(plugin ? `${baseUrl}/plugins/${plugin.id}` : baseUrl)

	const author = $derived(plugin?.author.split('<')[0].trim() ?? '')
	const provider = $derived(plugin ? providerKind(plugin.homepage) : 'github')
	const selectedAsset = $derived(platformList.find((p) => p.key === selectedPlatform))
</script>

<svelte:head>
	{#if plugin}
		<title>{plugin.name} · {branding.name}</title>
		<meta name="description" content={plugin.description} />
		<link rel="canonical" href={canonicalUrl} />
		<meta property="og:type" content="website" />
		<meta property="og:url" content={canonicalUrl} />
		<meta property="og:title" content={ogTitle} />
		<meta property="og:description" content={ogDescription} />
		<meta property="og:image" content={ogImage} />
		<meta property="og:site_name" content={branding.name} />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={ogTitle} />
		<meta name="twitter:description" content={ogDescription} />
		<meta name="twitter:image" content={ogImage} />
		{#if plugin.tags.length > 0}
			<meta name="keywords" content={plugin.tags.join(', ')} />
		{/if}
	{/if}
</svelte:head>

<div class="mx-auto max-w-6xl px-6 pb-24">
	{#if loading}
		<div class="space-y-6 pt-16">
			<Skeleton class="h-20 w-1/2 rounded-md" />
			<Skeleton class="h-32 w-full rounded-md" />
			<div class="grid gap-4 md:grid-cols-3">
				<Skeleton class="h-24 rounded-md" />
				<Skeleton class="h-24 rounded-md" />
				<Skeleton class="h-24 rounded-md" />
			</div>
		</div>
	{:else if notFound}
		<div class="rounded-lg border border-dashed border-border p-12 text-center space-y-3 mt-16">
			<p class="text-muted-foreground">{m.plugin_detail_not_found()}</p>
			<Button size="sm" variant="outline" href="/plugins">{m.plugin_detail_back_to_catalog()}</Button>
		</div>
	{:else if plugin}
		<!-- HERO -->
		<header class="relative pt-14 pb-10">
			<div
				class="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-primary/[0.03]"
			></div>

			<nav class="text-xs font-mono text-muted-foreground mb-6">
				<a href="/plugins" class="hover:text-foreground transition-colors">/plugins</a>
				<span class="opacity-50"> · </span>
				<span class="text-foreground">{plugin.id}</span>
			</nav>

			<div class="flex items-start gap-6 flex-wrap">
				<div
					class="h-20 w-20 rounded-xl border border-border flex items-center justify-center overflow-hidden flex-shrink-0 bg-card"
				>
					{#if plugin.iconUrl}
						<img src={plugin.iconUrl} alt={plugin.name} class="h-full w-full object-contain p-2" loading="eager" />
					{:else}
						<Boxes class="h-8 w-8 text-muted-foreground" strokeWidth={1.4} />
					{/if}
				</div>

				<div class="flex-1 min-w-[280px] space-y-3">
					<div class="flex items-center gap-3 flex-wrap">
						<h1 class="text-5xl md:text-6xl leading-[0.95] tracking-tight font-semibold">{plugin.name}</h1>
						{#if plugin.featured}
							<span
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] tracking-[0.18em] uppercase font-mono bg-warning/10 text-warning border border-warning/25"
							>
								<Sparkles class="h-3 w-3" />
								{m.plugin_detail_featured()}
							</span>
						{/if}
					</div>
					<p class="text-lg text-foreground/85 max-w-2xl leading-relaxed">{plugin.description}</p>
					<div class="flex items-center gap-4 text-sm text-muted-foreground flex-wrap pt-1">
						<span>{m.plugin_detail_by()} <span class="text-foreground">{author}</span></span>
						{#if plugin.latestVersion}
							<span class="font-mono text-foreground">v{plugin.latestVersion}</span>
						{/if}
						{#if plugin.license}
							<span class="inline-flex items-center gap-1.5"><Shield class="h-3.5 w-3.5" />{plugin.license}</span>
						{/if}
						{#if plugin.category}
							<Badge variant="outline">{plugin.category}</Badge>
						{/if}
					</div>
				</div>

				{#if isOwner}
					<div class="flex flex-col gap-2 ml-auto">
						<Button variant="outline" size="sm" onclick={transferOwnership} disabled={deleting}>
							<UserRoundCog class="h-3.5 w-3.5" />
							{m.plugin_detail_transfer()}
						</Button>
						<Button variant="destructive" size="sm" onclick={openDelete} disabled={deleting}>
							<Trash2 class="h-3.5 w-3.5" />
							{deleting ? m.plugin_detail_deleting() : m.plugin_detail_delete()}
						</Button>
					</div>
				{/if}
			</div>

			{#if plugin.tags.length > 0}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-6">
					{#each plugin.tags as tag (tag)}
						<a
							href={`/plugins?tag=${encodeURIComponent(tag)}`}
							class="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<span class="opacity-50">#</span>{tag}
						</a>
					{/each}
				</div>
			{/if}
		</header>

		<!-- TWO-COLUMN GRID -->
		<div class="grid gap-10 lg:grid-cols-[1fr_320px] mt-4">
			<div class="space-y-12 min-w-0">
				<!-- DOWNLOAD -->
				<section class="space-y-4">
					<div class="flex items-baseline justify-between gap-3 flex-wrap">
						<h2 class="text-2xl font-semibold tracking-tight">{m.plugin_detail_download_title()}</h2>
						<div class="flex items-center gap-3">
							{#if isOwner}
								<Button variant="ghost" size="sm" onclick={refreshFromForge} disabled={refreshing}>
									<RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" />
									{refreshing ? m.plugin_detail_refresh_running() : m.plugin_detail_refresh_button()}
								</Button>
							{/if}
							{#if latestRelease}
								<span class="text-xs font-mono text-muted-foreground">v{latestRelease.version}</span>
							{/if}
						</div>
					</div>
					{#if installDeepLink}
						<a
							href={installDeepLink.href}
							class="group flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.07] hover:border-primary/50 transition-colors"
						>
							<Rocket class="h-4 w-4 text-primary" />
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium">
									{m.plugin_detail_open_in_app({ app: installDeepLink.scheme.name })}
								</div>
								<div class="text-[11px] text-muted-foreground">{m.plugin_detail_open_in_app_subtitle()}</div>
							</div>
							<span class="font-mono text-[11px] text-muted-foreground">{installDeepLink.scheme.scheme}://</span>
						</a>
					{/if}
					{#if latestRelease && platformList.length > 0}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{#each platformList as p (p.key)}
								{@const [os, arch] = p.key.split('-')}
								<a
									href={`/api/plugins/${plugin.id}/latest?os=${encodeURIComponent(os ?? '')}&arch=${encodeURIComponent(arch ?? '')}&redirect=1`}
									class="group flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-foreground/[0.02] transition-colors"
								>
									<Download class="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
									<div class="flex-1 min-w-0">
										<div class="font-mono text-sm">{platformLabel(p.key)}</div>
										{#if p.size}
											<div class="text-[11px] text-muted-foreground">{formatBytes(p.size)}</div>
										{/if}
									</div>
								</a>
							{/each}
						</div>
					{:else}
						<div class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
							{m.plugin_detail_download_empty()}
						</div>
					{/if}
				</section>

				<!-- SCREENSHOTS -->
				{#if plugin.screenshots.length > 0}
					<section class="space-y-4">
						<h2 class="text-2xl font-semibold tracking-tight">{m.plugin_detail_screenshots()}</h2>
						<div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
							{#each plugin.screenshots as shot, i (shot.url)}
								<button
									type="button"
									class="group relative aspect-[16/10] rounded-lg border border-border overflow-hidden bg-card cursor-zoom-in transition-all hover:border-primary/40"
									onclick={() => (activeScreenshot = i)}
								>
									<img
										src={shot.url}
										alt={shot.alt ?? shot.caption ?? plugin.name}
										class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
										loading="lazy"
									/>
									{#if shot.caption}
										<span
											class="absolute inset-x-0 bottom-0 px-2.5 py-1.5 text-xs bg-gradient-to-t from-black/70 to-transparent text-white/90 text-left"
											>{shot.caption}</span
										>
									{/if}
								</button>
							{/each}
						</div>
					</section>
				{/if}

				<!-- README -->
				<section class="space-y-4">
					<div class="flex items-baseline justify-between gap-3 flex-wrap">
						<h2 class="text-2xl font-semibold tracking-tight">{m.plugin_detail_readme()}</h2>
						{#if plugin.readmeAvailableLocales && plugin.readmeAvailableLocales.length > 1}
							<div class="inline-flex items-center gap-2 text-xs text-muted-foreground">
								<Languages class="h-3.5 w-3.5" />
								<div class="inline-flex gap-1">
									{#each plugin.readmeAvailableLocales as loc (loc)}
										<span
											class="font-mono text-[11px] px-2 py-0.5 rounded border {loc === plugin.readmeLocale
												? 'text-foreground bg-primary/10 border-primary/30'
												: 'text-muted-foreground border-border'}">{LOCALE_LABELS[loc as Locale] ?? loc}</span
										>
									{/each}
								</div>
							</div>
						{/if}
					</div>
					{#if plugin.readmeHtml}
						<article
							class="prose prose-sm dark:prose-invert max-w-none rounded-xl border border-border bg-card px-9 py-8 prose-headings:font-semibold prose-headings:tracking-tight prose-pre:font-mono prose-pre:text-[12.5px] prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-code:font-mono"
						>
							{@html plugin.readmeHtml}
						</article>
					{:else}
						<div class="rounded-xl border border-dashed border-border p-8 text-center">
							<p class="text-sm text-muted-foreground">{m.plugin_detail_readme_missing()}</p>
						</div>
					{/if}
				</section>

				<!-- RELEASES -->
				{#if sortedReleases.length > 0}
					<section class="space-y-4">
						<div>
							<h2 class="text-2xl font-semibold tracking-tight">{m.plugin_detail_releases()}</h2>
							<p class="text-xs text-muted-foreground mt-1">{m.plugin_detail_releases_subtitle()}</p>
						</div>
						<div class="border-t border-border">
							{#each sortedReleases as release (release.id)}
								{@const totalSize = Object.values(release.assets).reduce((acc, a) => acc + (a.size ?? 0), 0)}
								{@const platformCount = Object.keys(release.assets).length}
								<details class="group border-b border-border [&_summary::-webkit-details-marker]:hidden">
									<summary
										class="grid grid-cols-[auto_1fr_auto] gap-4 items-center py-4 cursor-pointer list-none transition-opacity hover:opacity-90"
									>
										<span class="font-mono text-sm">v{release.version}</span>
										<span class="inline-flex gap-2 flex-wrap">
											<span
												class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground tracking-wide"
												>{platformCount} {platformCount === 1 ? 'platform' : 'platforms'}</span
											>
											{#if totalSize > 0}
												<span
													class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground tracking-wide"
													>{formatBytes(totalSize)}</span
												>
											{/if}
											{#if release.minRuntimeVersion}
												<span
													class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground tracking-wide"
													>runtime ≥ {release.minRuntimeVersion}</span
												>
											{/if}
										</span>
										<span class="font-mono text-[11px] text-muted-foreground whitespace-nowrap"
											>{formatRelative(release.createdAt)}</span
										>
									</summary>
									<div class="pb-4">
										<table class="w-full border-collapse">
											<tbody>
												{#each Object.entries(release.assets) as [key, asset] (key)}
													{@const [os, arch] = key.split('-')}
													<tr class="border-t border-dashed border-border/70 first:border-t-0">
														<td class="px-2.5 py-2 font-mono text-xs">{platformLabel(key)}</td>
														<td class="px-2.5 py-2 font-mono text-xs text-muted-foreground"
															>{asset.size ? formatBytes(asset.size) : ''}</td
														>
														<td
															class="px-2.5 py-2 font-mono text-[11px] text-muted-foreground truncate max-w-[280px]"
															title={asset.sha256 ?? ''}>{asset.sha256 ? asset.sha256.slice(0, 12) + '…' : ''}</td
														>
														<td class="px-2.5 py-2 text-right">
															<a
																href={`/api/plugins/${plugin.id}/latest?os=${encodeURIComponent(os ?? '')}&arch=${encodeURIComponent(arch ?? '')}&redirect=1`}
																class="font-mono text-[11px] text-primary hover:underline"
																>↓ {m.plugin_detail_download()}</a
															>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								</details>
							{/each}
						</div>
					</section>
				{/if}
			</div>

			<!-- SIDEBAR -->
			<aside class="space-y-6 lg:sticky lg:top-4 lg:self-start">
				<!-- STATS -->
				<div class="border border-border rounded-xl bg-card px-4">
					<div class="flex items-center justify-between py-3 border-b border-dashed border-border/70">
						<div
							class="inline-flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground font-mono"
						>
							<Star class="h-3.5 w-3.5" />
							<span>{m.plugin_detail_stat_stars()}</span>
						</div>
						<div class="text-2xl font-semibold leading-none">{formatNumber(stats?.stars)}</div>
					</div>
					<div class="flex items-center justify-between py-3 border-b border-dashed border-border/70">
						<div
							class="inline-flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground font-mono"
						>
							<Download class="h-3.5 w-3.5" />
							<span>{m.plugin_detail_stat_downloads()}</span>
						</div>
						<div class="text-2xl font-semibold leading-none">{formatNumber(plugin.downloads)}</div>
					</div>
					<div class="flex items-center justify-between py-3 border-b border-dashed border-border/70">
						<div
							class="inline-flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground font-mono"
						>
							<Clock class="h-3.5 w-3.5" />
							<span>{m.plugin_detail_stat_last_release()}</span>
						</div>
						<div class="text-base">{formatRelative(latestRelease?.createdAt)}</div>
					</div>
					{#if latestRelease}
						<div class="flex items-center justify-between py-3 border-b border-dashed border-border/70">
							<div
								class="inline-flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground font-mono"
							>
								<HardDrive class="h-3.5 w-3.5" />
								<span>{m.plugin_detail_stat_size()}</span>
							</div>
							<div class="text-base">{formatBytes(totalReleaseSize(latestRelease))}</div>
						</div>
					{/if}
					{#if latestRelease?.minRuntimeVersion}
						<div class="flex items-center justify-between py-3">
							<div
								class="inline-flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground font-mono"
							>
								<Cpu class="h-3.5 w-3.5" />
								<span>{m.plugin_detail_stat_runtime()}</span>
							</div>
							<div class="text-base">≥ {latestRelease.minRuntimeVersion}</div>
						</div>
					{/if}
				</div>

				<!-- LINKS -->
				<div class="flex flex-col border border-border rounded-xl overflow-hidden">
					{#if plugin.homepage}
						<a
							class="inline-flex items-center gap-2.5 px-3.5 py-2.5 text-sm bg-card hover:bg-foreground/[0.04] transition-colors border-b border-border last:border-b-0"
							href={plugin.homepage}
							target="_blank"
							rel="noreferrer"
						>
							<Code2 class="h-4 w-4" />
							<span class="capitalize">{provider}</span>
							<ExternalLink class="h-3 w-3 ml-auto opacity-50" />
						</a>
					{/if}
					{#if plugin.documentationUrl}
						<a
							class="inline-flex items-center gap-2.5 px-3.5 py-2.5 text-sm bg-card hover:bg-foreground/[0.04] transition-colors border-b border-border last:border-b-0"
							href={plugin.documentationUrl}
							target="_blank"
							rel="noreferrer"
						>
							<BookOpen class="h-4 w-4" />
							<span>{m.plugin_detail_docs()}</span>
							<ExternalLink class="h-3 w-3 ml-auto opacity-50" />
						</a>
					{/if}
					{#if plugin.issuesUrl}
						<a
							class="inline-flex items-center gap-2.5 px-3.5 py-2.5 text-sm bg-card hover:bg-foreground/[0.04] transition-colors border-b border-border last:border-b-0"
							href={plugin.issuesUrl}
							target="_blank"
							rel="noreferrer"
						>
							<Bug class="h-4 w-4" />
							<span>{m.plugin_detail_report_issue()}</span>
							<ExternalLink class="h-3 w-3 ml-auto opacity-50" />
						</a>
					{/if}
				</div>
			</aside>
		</div>
	{/if}
</div>

{#if activeScreenshot !== null && plugin && plugin.screenshots[activeScreenshot]}
	<button
		type="button"
		class="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-center justify-center p-8 cursor-zoom-out"
		onclick={() => (activeScreenshot = null)}
		aria-label={m.plugin_detail_close_screenshot()}
	>
		<img
			src={plugin.screenshots[activeScreenshot].url}
			alt={plugin.screenshots[activeScreenshot].alt ?? ''}
			class="max-h-full max-w-full rounded-lg shadow-2xl"
		/>
	</button>
{/if}

{#if plugin}
	<ConfirmDialog
		bind:open={deleteOpen}
		title={m.plugin_detail_delete_title()}
		description={m.plugin_detail_delete_description({ id: plugin.id })}
		confirmWord={plugin.id}
		confirmLabel={m.plugin_detail_delete()}
		busy={deleting}
		onConfirm={confirmDelete}
	/>
{/if}
