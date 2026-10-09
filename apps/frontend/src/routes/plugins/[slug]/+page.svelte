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
	import Ban from '@lucide/svelte/icons/ban'
	import Undo2 from '@lucide/svelte/icons/undo-2'
	import Cpu from '@lucide/svelte/icons/cpu'
	import HardDrive from '@lucide/svelte/icons/hard-drive'
	import Languages from '@lucide/svelte/icons/languages'
	import FolderGit2 from '@lucide/svelte/icons/folder-git-2'
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import Check from '@lucide/svelte/icons/check'
	import Terminal from '@lucide/svelte/icons/terminal'
	import Mail from '@lucide/svelte/icons/mail'
	import Scale from '@lucide/svelte/icons/scale'
	import Tag from '@lucide/svelte/icons/tag'
	import FileText from '@lucide/svelte/icons/file-text'
	import ImageIcon from '@lucide/svelte/icons/image'
	import History from '@lucide/svelte/icons/history'
	import ChartBar from '@lucide/svelte/icons/chart-bar'
	import Settings2 from '@lucide/svelte/icons/settings-2'
	import ChevronDown from '@lucide/svelte/icons/chevron-down'
	import AppWindow from '@lucide/svelte/icons/app-window'
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right'
	import { BarChart } from 'layerchart'
	import Button from '$components/ui/Button.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import VerifiedBadge from '$components/ui/VerifiedBadge.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'
	import YankDialog from '$components/ui/YankDialog.svelte'
	import { isPrerelease } from '$lib/utils'
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { instanceInfo, buildInstallDeepLink } from '$lib/stores/instance-info.svelte'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { toast } from 'svelte-sonner'
	import type { Plugin, PluginStats, Release } from '$lib/types'
	import { fetchDownloadStatistics, formatDownloadCount, type DownloadStatisticsState } from '$lib/downloads'
	import { m } from '$lib/paraglide/messages'

	const slug = $derived(page.params.slug)
	const locale = $derived(i18n.current)

	let plugin = $state<Plugin | null>(null)
	let stats = $state<PluginStats | null>(null)
	let downloadStats = $state<DownloadStatisticsState>({ status: 'loading' })
	let loading = $state(true)
	let notFound = $state(false)
	let deleting = $state(false)
	let refreshing = $state(false)
	let deleteOpen = $state(false)
	let activeScreenshot = $state<number | null>(null)
	let selectedPlatform = $state<string | null>(null)
	let copying = $state(false)
	let yankOpen = $state(false)
	let yankTarget = $state<{ version: string } | null>(null)
	let yanking = $state(false)
	let unyankingId = $state<string | null>(null)

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
		const currentSlug = slug
		let disposed = false
		downloadStats = { status: 'loading' }
		void fetchDownloadStatistics(() => eden.api.plugins({ slug: currentSlug }).downloads.get()).then((result) => {
			if (!disposed) downloadStats = result
		})
		return () => {
			disposed = true
		}
	})

	$effect(() => {
		void slug
		void locale
		untrack(() => load(locale))
	})

	// README as it stood at each release, loaded the first time a release row is
	// expanded. Kept out of the plugin payload so the detail response does not
	// have to carry a full README per version.
	type VersionReadme = { loading: boolean; html: string | null; captured: boolean }
	let versionReadmes = $state<Record<string, VersionReadme>>({})

	async function loadVersionReadme(pluginId: string, version: string) {
		if (versionReadmes[version]) return
		versionReadmes[version] = { loading: true, html: null, captured: false }
		try {
			const res = await fetch(
				`/api/plugins/${encodeURIComponent(pluginId)}/releases/${encodeURIComponent(version)}/readme?locale=${encodeURIComponent(locale)}`,
			)
			if (!res.ok) throw new Error(String(res.status))
			const data = (await res.json()) as { readmeHtml: string | null; captured: boolean }
			versionReadmes[version] = { loading: false, html: data.readmeHtml, captured: data.captured }
		} catch {
			versionReadmes[version] = { loading: false, html: null, captured: false }
		}
	}

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

	function downloadHref(slug: string, key: string): string {
		const [os, arch] = key.split('-')
		return `/api/plugins/${slug}/latest?os=${encodeURIComponent(os ?? '')}&arch=${encodeURIComponent(arch ?? '')}&redirect=1`
	}

	const primaryDownload = $derived.by(() => {
		if (!plugin || platformList.length === 0) return null
		const guessed = guessPlatform(platformList.map((p) => p.key))
		const match = platformList.find((p) => p.key === guessed)
		if (!match) return null
		return { ...match, href: downloadHref(plugin.id, match.key) }
	})

	// Every platform asset, the one matching the visitor's system first.
	const downloadOptions = $derived.by(() => {
		const slug = plugin?.id
		if (!slug) return [] as Array<{ key: string; url: string; size?: number; sha256?: string; href: string }>
		const first = primaryDownload?.key
		return [...platformList]
			.sort((a, b) => Number(b.key === first) - Number(a.key === first))
			.map((p) => ({ ...p, href: downloadHref(slug, p.key) }))
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
				const body = error.value as { error?: string; reauthFor?: string } | undefined
				if (body?.reauthFor) {
					toast.info(m.plugin_detail_refresh_reauth_redirect())
					window.location.href = `/auth/${body.reauthFor}?link=1&return_to=${encodeURIComponent(window.location.pathname)}`
					return
				}
				if (error.status === 429) {
					toast.error(m.plugin_detail_refresh_rate_limited())
				} else {
					throw new Error(
						typeof error.value === 'string' ? error.value : (body?.error ?? `Request failed (${error.status})`),
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

	function openYank(release: Release) {
		yankTarget = { version: release.version }
		yankOpen = true
	}

	async function confirmYank(reason: string | null) {
		if (!plugin || !yankTarget) return
		yanking = true
		try {
			const { error } = await eden.api
				.plugins({ slug: plugin.id })
				.releases({ version: yankTarget.version })
				.yank.post({ reason: reason ?? undefined })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.plugin_detail_yank_success())
			yankOpen = false
			yankTarget = null
			await load(locale)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.plugin_detail_yank_failed())
		} finally {
			yanking = false
		}
	}

	async function unyankRelease(release: Release) {
		if (!plugin || unyankingId === release.id) return
		unyankingId = release.id
		try {
			const { error } = await eden.api
				.plugins({ slug: plugin.id })
				.releases({ version: release.version })
				.yank.post({ unyank: true })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.plugin_detail_unyank_success())
			await load(locale)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.plugin_detail_yank_failed())
		} finally {
			unyankingId = null
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

	const ogImage = $derived(plugin?.iconUrl ?? `${baseUrl}/favicon.png`)
	const ogTitle = $derived(plugin ? `${plugin.name} — ${branding.name}` : branding.name)
	const ogDescription = $derived(plugin?.description ?? '')
	const canonicalUrl = $derived(plugin ? `${baseUrl}/plugins/${plugin.id}` : baseUrl)

	const author = $derived(plugin?.author.split('<')[0].trim() ?? '')
	const provider = $derived(plugin ? providerKind(plugin.homepage) : 'github')
	const selectedAsset = $derived(platformList.find((p) => p.key === selectedPlatform))

	const app = $derived(branding.companionApp)

	const cardClass = 'rounded-lg border border-border bg-card tabularis:rounded-md tabularis:border-[0.1rem]'
	// Section accents, in the order tabularis.dev cycles its section eyebrows.
	const TONES = { purple: '#c084fc', teal: '#2dd4bf', blue: '#60a5fa', orange: '#fdba74' }
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

{#snippet sectionHead(Icon: typeof Download, title: string, tone: string, subtitle?: string)}
	<div class="flex items-start gap-3 min-w-0">
		<span class="section-icon" style:--tone={tone} aria-hidden="true"><Icon class="h-4 w-4" /></span>
		<div class="min-w-0">
			<h2 class="text-2xl font-semibold tracking-tight">{title}</h2>
			{#if subtitle}
				<p class="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet detailRow(Icon: typeof Download, label: string, value: string)}
	<div class="flex items-center justify-between gap-3 py-2.5 border-t border-border first:border-t-0">
		<dt class="inline-flex items-center gap-2 text-sm text-muted-foreground">
			<Icon class="h-3.5 w-3.5" />{label}
		</dt>
		<dd class="min-w-0 truncate text-sm font-medium text-foreground tabular-nums">{value}</dd>
	</div>
{/snippet}

{#snippet linkRow(Icon: typeof Download, label: string, href: string, hint?: string)}
	<a
		class="group flex items-center gap-2.5 px-4 py-3 text-sm border-t border-border first:border-t-0 transition-colors hover:bg-foreground/[0.03]"
		{href}
		target="_blank"
		rel="noreferrer"
	>
		<Icon class="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
		<span class="flex-1">{label}</span>
		{#if hint}<span class="font-mono text-[11px] text-muted-foreground">{hint}</span>{/if}
		<ExternalLink class="h-3 w-3 opacity-50" />
	</a>
{/snippet}

{#if loading}
	<div class="mx-auto max-w-6xl px-6 pt-20 pb-24">
		<div class="flex flex-col items-center gap-5">
			<Skeleton class="h-24 w-24 rounded-2xl" />
			<Skeleton class="h-12 w-2/3 max-w-md rounded-md" />
			<Skeleton class="h-5 w-full max-w-xl rounded-md" />
			<Skeleton class="h-11 w-64 rounded-md" />
		</div>
		<div class="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
			<Skeleton class="h-64 rounded-lg" />
			<Skeleton class="h-64 rounded-lg" />
		</div>
	</div>
{:else if notFound}
	<div class="mx-auto max-w-6xl px-6 pb-24">
		<div class="rounded-lg border border-dashed border-border p-12 text-center space-y-3 mt-16">
			<p class="text-muted-foreground">{m.plugin_detail_not_found()}</p>
			<Button size="sm" variant="outline" href="/plugins">{m.plugin_detail_back_to_catalog()}</Button>
		</div>
	</div>
{:else if plugin}
	<!-- HERO: centred page header after tabularis.dev -->
	<section class="hero-grid border-b border-border">
		<div class="hero-aurora" aria-hidden="true"></div>
		<div class="mx-auto max-w-6xl px-6 pt-8 pb-14 sm:pb-16">
			<nav class="flex items-center gap-2 flex-wrap text-xs font-mono text-muted-foreground" aria-label="Breadcrumb">
				<a href="/plugins" class="hover:text-foreground transition-colors">/plugins</a>
				{#if plugin.category}
					<span class="opacity-40">/</span>
					<a
						href={`/plugins?category=${encodeURIComponent(plugin.category)}`}
						class="hover:text-foreground transition-colors">{plugin.category}</a
					>
				{/if}
				<span class="opacity-40">/</span>
				<span class="text-foreground">{plugin.id}</span>
			</nav>

			<div class="mt-10 flex flex-col items-center text-center">
				<div class="icon-tile">
					{#if plugin.iconUrl}
						<img src={plugin.iconUrl} alt={plugin.name} loading="eager" />
					{:else}
						<Boxes class="h-10 w-10 text-muted-foreground" strokeWidth={1.4} />
					{/if}
				</div>

				<span
					class="mt-8 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold uppercase tracking-[0.04em] text-primary"
				>
					<Boxes class="h-[1.125rem] w-[1.125rem]" />
					{m.nav_plugins()}{#if plugin.category}&nbsp;· {plugin.category}{/if}
				</span>
				<h1 class="mt-3 max-w-4xl text-5xl sm:text-6xl font-semibold tracking-tight text-foreground">
					{plugin.name}
				</h1>
				<p class="mt-5 max-w-2xl text-lg text-muted-foreground">{plugin.description}</p>

				<div class="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
					{#if plugin.latestVersion}
						<span class="version-pill">v{plugin.latestVersion}</span>
						{#if isPrerelease(plugin.latestVersion)}
							<span
								class="rounded-full border border-warning/30 bg-warning/15 px-2.5 py-0.5 font-mono text-[0.7rem] text-warning"
								>{m.plugin_prerelease_badge()}</span
							>
						{/if}
					{/if}
					{#if plugin.verified}
						<VerifiedBadge size="md" verifiedAt={plugin.verifiedAt ?? null} />
					{/if}
					{#if plugin.featured}
						<span
							class="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs text-warning"
						>
							<Sparkles class="h-3 w-3" />
							{m.plugin_detail_featured()}
						</span>
					{/if}
					<span class="meta-divider hidden sm:inline-block" aria-hidden="true"></span>
					<span>{m.plugin_detail_by()} <span class="text-foreground font-medium">{author}</span></span>
					<span class="inline-flex items-center gap-1.5 tabular-nums">
						<Download class="h-3.5 w-3.5" />{formatDownloadCount(plugin.downloads, locale)}
					</span>
					{#if stats && stats.stars != null}
						<span class="inline-flex items-center gap-1.5 tabular-nums">
							<Star class="h-3.5 w-3.5" />{formatNumber(stats.stars)}
						</span>
					{/if}
				</div>

				<div class="mt-9 flex flex-wrap items-center justify-center gap-3">
					{#if installDeepLink}
						<Button size="lg" href={installDeepLink.href}>
							<Rocket class="h-4 w-4" />
							{m.plugin_detail_open_in_app({ app: installDeepLink.scheme.name })}
						</Button>
					{/if}
					{#if primaryDownload}
						<Button
							size="lg"
							variant={installDeepLink ? 'outline' : 'default'}
							href={primaryDownload.href}
							data-sveltekit-reload
						>
							<Download class="h-4 w-4" />
							{m.plugin_detail_download_for({ platform: platformLabel(primaryDownload.key) })}
						</Button>
					{/if}
					{#if plugin.homepage && !(installDeepLink && primaryDownload)}
						<Button size="lg" variant="outline" href={plugin.homepage} target="_blank" rel="noreferrer">
							<FolderGit2 class="h-4 w-4" />
							{m.plugin_detail_repository()}
						</Button>
					{/if}
				</div>

				{#if plugin.tags.length > 0}
					<div class="mt-7 flex flex-wrap items-center justify-center gap-1.5">
						{#each plugin.tags as tag (tag)}
							<a href={`/plugins?tag=${encodeURIComponent(tag)}`} class="tag-pill">
								<span class="opacity-50">#</span>{tag}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>

	<div class="mx-auto max-w-6xl px-6 pt-14 pb-24">
		<div class="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
			<div class="space-y-16 min-w-0">
				<!-- INSTALL -->
				<section id="install" class="space-y-6">
					<div class="flex items-start justify-between gap-4 flex-wrap">
						{@render sectionHead(Download, m.plugin_detail_download_title(), TONES.teal)}
						{#if latestRelease}
							<div class="flex items-center gap-2 pt-2">
								<span class="font-mono text-xs text-muted-foreground">v{latestRelease.version}</span>
								{#if isPrerelease(latestRelease.version)}
									<span class="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[10px] tracking-wide text-warning"
										>{m.plugin_prerelease_badge()}</span
									>
								{/if}
							</div>
						{/if}
					</div>

					{#if installDeepLink}
						<a
							href={installDeepLink.href}
							class="group flex items-center gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:p-5 transition-colors hover:border-primary/60 tabularis:rounded-md tabularis:border-[0.1rem]"
						>
							<span
								class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary"
							>
								<Rocket class="h-5 w-5" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block font-semibold">
									{m.plugin_detail_open_in_app({ app: installDeepLink.scheme.name })}
								</span>
								<span class="mt-0.5 block text-sm text-muted-foreground">
									{m.plugin_detail_open_in_app_subtitle()}
								</span>
							</span>
							<ArrowUpRight
								class="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
							/>
						</a>
					{/if}

					{#if app.name}
						<div
							class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 text-sm tabularis:rounded-md tabularis:border-[0.1rem]"
						>
							<AppWindow class="h-4 w-4 flex-shrink-0 text-primary" />
							<span class="flex-1 min-w-[12rem]">
								{m.app_plugin_note({ app: app.name })}
								{#if latestRelease?.minRuntimeVersion}
									<span class="font-mono text-xs text-muted-foreground">≥ {latestRelease.minRuntimeVersion}</span>
								{/if}
								{#if app.downloadUrl}
									<span class="text-muted-foreground">{m.app_plugin_note_missing()}</span>
								{/if}
							</span>
							{#if app.downloadUrl}
								<a
									href={app.downloadUrl}
									target="_blank"
									rel="noopener"
									class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
								>
									{m.app_download({ app: app.name })}
									<ArrowRight class="h-3.5 w-3.5" />
								</a>
							{/if}
						</div>
					{/if}

					{#if latestRelease && downloadOptions.length > 0}
						<div class="space-y-3">
							<span class="option-label">{m.plugin_detail_download_pick_platform()}</span>
							<ul class="{cardClass} divide-y divide-border overflow-hidden">
								{#each downloadOptions as p (p.key)}
									{@const mine = p.key === primaryDownload?.key}
									<li class="flex items-center gap-4 px-4 py-3">
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<span class="font-medium">{platformLabel(p.key)}</span>
												{#if mine}
													<span
														class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
														>{m.plugin_detail_your_platform()}</span
													>
												{/if}
											</div>
											<div class="mt-0.5 font-mono text-[11px] text-muted-foreground">
												{[p.size ? formatBytes(p.size) : null, p.sha256 ? `sha256 ${p.sha256.slice(0, 12)}…` : null]
													.filter(Boolean)
													.join(' · ')}
											</div>
										</div>
										<Button
											size="sm"
											variant={mine && !installDeepLink ? 'default' : 'outline'}
											href={p.href}
											data-sveltekit-reload
											class="capitalize"
										>
											<Download class="h-3.5 w-3.5" />
											{m.plugin_detail_download()}
										</Button>
									</li>
								{/each}
							</ul>
						</div>

						<div class="space-y-3">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<span class="option-label inline-flex items-center gap-2">
									<Terminal class="h-4 w-4 text-muted-foreground" />
									{m.plugin_detail_install_subtitle()}
								</span>
								{#if platformList.length > 1}
									<select
										bind:value={selectedPlatform}
										aria-label={m.plugin_detail_download_pick_platform()}
										class="h-8 rounded-md border border-input bg-transparent px-2.5 font-mono text-xs"
									>
										{#each platformList as p (p.key)}
											<option value={p.key}>{platformLabel(p.key)}</option>
										{/each}
									</select>
								{/if}
							</div>
							<div
								class="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 tabularis:rounded-sm tabularis:border-[0.1rem]"
							>
								<code class="min-w-0 flex-1 truncate font-mono text-[0.85rem] text-muted-foreground"
									>{installCommand}</code
								>
								<button
									type="button"
									onclick={copyInstall}
									aria-label={m.plugin_detail_copy()}
									title={m.plugin_detail_copy()}
									class="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
								>
									{#if copying}
										<Check class="h-3.5 w-3.5 text-primary" />
									{:else}
										<Copy class="h-3.5 w-3.5" />
									{/if}
								</button>
							</div>
						</div>
					{:else}
						<div class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
							{m.plugin_detail_download_empty()}
						</div>
					{/if}
				</section>

				<!-- SCREENSHOTS -->
				{#if plugin.screenshots.length > 0}
					<section class="space-y-6">
						{@render sectionHead(ImageIcon, m.plugin_detail_screenshots(), TONES.purple)}
						<div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
							{#each plugin.screenshots as shot, i (shot.url)}
								<button
									type="button"
									class="group relative aspect-[16/10] overflow-hidden rounded-lg border border-border bg-card cursor-zoom-in transition-colors hover:border-primary/40 tabularis:rounded-md tabularis:border-[0.1rem]"
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
											class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5 text-left text-xs text-white/90"
											>{shot.caption}</span
										>
									{/if}
								</button>
							{/each}
						</div>
					</section>
				{/if}

				<!-- README -->
				<section class="space-y-6">
					<div class="flex items-start justify-between gap-3 flex-wrap">
						{@render sectionHead(FileText, m.plugin_detail_readme(), TONES.blue)}
						{#if plugin.readmeAvailableLocales && plugin.readmeAvailableLocales.length > 1}
							<div class="inline-flex items-center gap-2 pt-2 text-xs text-muted-foreground">
								<Languages class="h-3.5 w-3.5" />
								<div class="inline-flex gap-1">
									{#each plugin.readmeAvailableLocales as loc (loc)}
										<span
											class="rounded-full border px-2 py-0.5 font-mono text-[11px] {loc === plugin.readmeLocale
												? 'border-primary/30 bg-primary/10 text-foreground'
												: 'border-border text-muted-foreground'}">{LOCALE_LABELS[loc as Locale] ?? loc}</span
										>
									{/each}
								</div>
							</div>
						{/if}
					</div>
					{#if plugin.readmeHtml}
						<article
							class="{cardClass} prose prose-sm dark:prose-invert max-w-none px-6 py-6 sm:px-9 sm:py-8 prose-headings:font-semibold prose-headings:tracking-tight prose-pre:font-mono prose-pre:text-[12.5px] prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-code:font-mono"
						>
							{@html plugin.readmeHtml}
						</article>
					{:else}
						<div class="rounded-lg border border-dashed border-border p-8 text-center tabularis:rounded-md">
							<p class="text-sm text-muted-foreground">{m.plugin_detail_readme_missing()}</p>
						</div>
					{/if}
				</section>

				<!-- RELEASES -->
				{#if sortedReleases.length > 0}
					<section class="space-y-6">
						{@render sectionHead(
							History,
							m.plugin_detail_releases(),
							TONES.orange,
							m.plugin_detail_releases_subtitle(),
						)}
						<div class="{cardClass} divide-y divide-border overflow-hidden">
							{#each sortedReleases as release, i (release.id)}
								{@const totalSize = Object.values(release.assets).reduce((acc, a) => acc + (a.size ?? 0), 0)}
								{@const platformCount = Object.keys(release.assets).length}
								{@const vr = versionReadmes[release.version]}
								<details
									class="group [&_summary::-webkit-details-marker]:hidden"
									ontoggle={(e) => {
										if (plugin && (e.currentTarget as HTMLDetailsElement).open)
											void loadVersionReadme(plugin.id, release.version)
									}}
								>
									<summary
										class="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-foreground/[0.02]"
									>
										<span class={i === 0 ? 'version-pill' : 'font-mono text-sm px-2.5'}>v{release.version}</span>
										<span class="inline-flex flex-wrap gap-1.5">
											<span class="chip">{platformCount} {platformCount === 1 ? 'platform' : 'platforms'}</span>
											{#if totalSize > 0}
												<span class="chip">{formatBytes(totalSize)}</span>
											{/if}
											{#if release.minRuntimeVersion}
												<span class="chip">runtime ≥ {release.minRuntimeVersion}</span>
											{/if}
											{#if isPrerelease(release.version)}
												<span class="chip !bg-warning/15 !text-warning">{m.plugin_prerelease_badge()}</span>
											{/if}
											{#if release.yankedAt}
												<span class="chip !bg-destructive/15 !text-destructive">{m.plugin_detail_yanked_badge()}</span>
											{/if}
										</span>
										<span
											class="inline-flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground"
										>
											{formatRelative(release.createdAt)}
											<ChevronDown class="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
										</span>
									</summary>
									<div class="space-y-4 border-t border-dashed border-border px-4 pt-3 pb-5">
										{#if release.yankedAt || isOwner}
											<div class="flex flex-wrap items-center justify-between gap-3">
												{#if release.yankedAt}
													<div class="text-xs text-muted-foreground">
														<span class="font-mono text-destructive">{m.plugin_detail_yanked_badge()}</span>
														{#if release.yankReason}
															· <span class="italic">{release.yankReason}</span>
														{/if}
														· {formatRelative(release.yankedAt)}
													</div>
												{:else}
													<span></span>
												{/if}
												{#if isOwner}
													{#if release.yankedAt}
														<Button
															variant="outline"
															size="sm"
															onclick={() => unyankRelease(release)}
															disabled={unyankingId === release.id}
														>
															<Undo2 class="h-3.5 w-3.5" />
															{m.plugin_detail_unyank_button()}
														</Button>
													{:else}
														<Button variant="ghost" size="sm" onclick={() => openYank(release)}>
															<Ban class="h-3.5 w-3.5" />
															{m.plugin_detail_yank_button()}
														</Button>
													{/if}
												{/if}
											</div>
										{/if}
										<table class="w-full border-collapse">
											<tbody>
												{#each Object.entries(release.assets) as [key, asset] (key)}
													{@const [os, arch] = key.split('-')}
													<tr class="border-t border-dashed border-border/70 first:border-t-0">
														<td class="py-2 pr-3 font-mono text-xs">{platformLabel(key)}</td>
														<td class="px-3 py-2 font-mono text-xs text-muted-foreground"
															>{asset.size ? formatBytes(asset.size) : ''}</td
														>
														<td
															class="max-w-[280px] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground"
															title={asset.sha256 ?? ''}>{asset.sha256 ? asset.sha256.slice(0, 12) + '…' : ''}</td
														>
														<td class="py-2 pl-3 text-right">
															<a
																href={`/api/plugins/${plugin.id}/latest?os=${encodeURIComponent(os ?? '')}&arch=${encodeURIComponent(arch ?? '')}&redirect=1`}
																data-sveltekit-reload
																class="font-mono text-[11px] text-primary hover:underline"
																>↓ {m.plugin_detail_download()}</a
															>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
										<div>
											<h3 class="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
												{m.plugin_detail_release_readme_title()}
											</h3>
											{#if !vr || vr.loading}
												<Skeleton class="h-24 w-full rounded-lg" />
											{:else if vr.html}
												<article
													class="prose prose-sm dark:prose-invert max-w-none rounded-lg border border-border bg-background/40 px-5 py-4 prose-headings:font-semibold prose-headings:tracking-tight prose-pre:font-mono prose-pre:text-[12.5px] prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-code:font-mono tabularis:rounded-md"
												>
													{@html vr.html}
												</article>
											{:else}
												<p class="text-xs italic text-muted-foreground">{m.plugin_detail_release_readme_missing()}</p>
											{/if}
										</div>
									</div>
								</details>
							{/each}
						</div>
					</section>
				{/if}

				<!-- DOWNLOAD STATS PER VERSION -->
				<section class="space-y-6">
					{@render sectionHead(ChartBar, m.plugin_detail_downloads_per_version(), TONES.purple)}
					{#if downloadStats.status === 'ready' && downloadStats.data.versions.length > 0}
						<div class="{cardClass} space-y-6 p-4 sm:p-6">
							<div style:height="{Math.max(180, downloadStats.data.versions.length * 28 + 60)}px">
								<BarChart
									data={downloadStats.data.versions.map((v) => ({ ...v, label: `v${v.version}` }))}
									x="total"
									y="label"
									orientation="horizontal"
									bandPadding={0.3}
								/>
							</div>
							<ul class="space-y-1.5 text-xs">
								{#each downloadStats.data.versions as v (v.version)}
									<li class="flex flex-wrap items-center gap-x-3 gap-y-1">
										<span class="min-w-[60px] font-mono text-foreground/80">v{v.version}</span>
										<span class="font-mono tabular-nums text-muted-foreground"
											>{formatDownloadCount(v.total, locale)}</span
										>
										<span class="flex flex-wrap gap-1.5">
											{#each Object.entries(v.platforms) as [pl, n] (pl)}
												<span class="chip">{platformLabel(pl)} · {formatDownloadCount(n, locale)}</span>
											{/each}
										</span>
									</li>
								{/each}
							</ul>
						</div>
					{:else if downloadStats.status === 'loading'}
						<div role="status" class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
							{m.common_loading()}
						</div>
					{:else if downloadStats.status === 'unavailable'}
						<div role="status" class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
							{m.plugin_detail_downloads_unavailable()}
						</div>
					{:else}
						<div class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
							{m.plugin_detail_downloads_empty()}
						</div>
					{/if}
				</section>
			</div>

			<!-- SIDEBAR -->
			<aside class="space-y-6 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
				<div class={cardClass}>
					<h2 class="sidebar-title">{m.plugin_detail_details()}</h2>
					<dl class="px-4 pb-1.5">
						{@render detailRow(
							Download,
							m.plugin_detail_stat_downloads(),
							formatDownloadCount(plugin.downloads, locale),
						)}
						{#if stats && stats.stars != null}
							{@render detailRow(Star, m.plugin_detail_stat_stars(), formatNumber(stats.stars))}
						{/if}
						{@render detailRow(Clock, m.plugin_detail_stat_last_release(), formatRelative(latestRelease?.createdAt))}
						{#if primaryDownload?.size}
							{@render detailRow(HardDrive, m.plugin_detail_stat_size(), formatBytes(primaryDownload.size))}
						{/if}
						{#if latestRelease?.minRuntimeVersion}
							{@render detailRow(Cpu, m.plugin_detail_stat_runtime(), `≥ ${latestRelease.minRuntimeVersion}`)}
						{/if}
						{#if plugin.license}
							{@render detailRow(Scale, m.plugin_detail_license(), plugin.license)}
						{/if}
						{#if plugin.category}
							{@render detailRow(Tag, m.plugin_detail_category(), plugin.category)}
						{/if}
					</dl>
				</div>

				{#if plugin.homepage || plugin.documentationUrl || plugin.issuesUrl || plugin.supportEmail || (app.name && app.url)}
					<div class="{cardClass} overflow-hidden">
						<h2 class="sidebar-title">{m.plugin_detail_links()}</h2>
						<div class="border-t border-border">
							{#if plugin.homepage}
								{@render linkRow(FolderGit2, m.plugin_detail_repository(), plugin.homepage, provider)}
							{/if}
							{#if plugin.documentationUrl}
								{@render linkRow(BookOpen, m.plugin_detail_docs(), plugin.documentationUrl)}
							{/if}
							{#if plugin.issuesUrl}
								{@render linkRow(Bug, m.plugin_detail_report_issue(), plugin.issuesUrl)}
							{/if}
							{#if plugin.supportEmail}
								{@render linkRow(Mail, m.plugin_detail_email_support(), `mailto:${plugin.supportEmail}`)}
							{/if}
							{#if app.name && app.url}
								{@render linkRow(AppWindow, m.app_website({ app: app.name }), app.url)}
							{/if}
						</div>
					</div>
				{/if}

				{#if isOwner}
					<div class={cardClass}>
						<h2 class="sidebar-title inline-flex items-center gap-2">
							<Settings2 class="h-3.5 w-3.5" />{m.plugin_detail_manage()}
						</h2>
						<div class="flex flex-col gap-2 px-4 pb-4">
							<Button variant="outline" size="sm" onclick={refreshFromForge} disabled={refreshing}>
								<RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" />
								{refreshing ? m.plugin_detail_refresh_running() : m.plugin_detail_refresh_button()}
							</Button>
							<Button variant="outline" size="sm" onclick={transferOwnership} disabled={deleting}>
								<UserRoundCog class="h-3.5 w-3.5" />
								{m.plugin_detail_transfer()}
							</Button>
							<Button variant="destructive" size="sm" onclick={openDelete} disabled={deleting}>
								<Trash2 class="h-3.5 w-3.5" />
								{deleting ? m.plugin_detail_deleting() : m.plugin_detail_delete()}
							</Button>
						</div>
					</div>
				{/if}
			</aside>
		</div>
	</div>
{/if}

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

{#if plugin && yankTarget}
	<YankDialog bind:open={yankOpen} version={yankTarget.version} busy={yanking} onConfirm={confirmYank} />
{/if}

<style>
	/* App-icon tile with a faint dot texture, as on the tabularis.dev download page. */
	.icon-tile {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 6rem;
		height: 6rem;
		overflow: hidden;
		border: 0.1rem solid var(--color-border);
		border-radius: 22%;
		background-color: var(--color-card);
		background-image:
			radial-gradient(color-mix(in srgb, var(--color-foreground) 6%, transparent) 1px, transparent 1.5px),
			radial-gradient(color-mix(in srgb, var(--color-foreground) 4%, transparent) 1px, transparent 1px);
		background-size:
			7px 7px,
			11px 11px;
		background-position:
			0 0,
			3px 5px;
		box-shadow:
			0 0.6rem 1.5rem rgb(0 0 0 / 0.4),
			inset 0 0.1rem 0 rgb(255 255 255 / 0.06),
			inset 0 -0.1rem 0 rgb(0 0 0 / 0.35);
	}
	:global(:root:not(.dark)) .icon-tile {
		box-shadow:
			0 0.6rem 1.5rem rgb(15 23 42 / 0.12),
			inset 0 0.1rem 0 rgb(255 255 255 / 0.8);
	}
	.icon-tile img {
		width: 62%;
		height: 62%;
		object-fit: contain;
	}

	/* Inverted version pill (tabularis.dev plugin cards). */
	.version-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background-color: var(--color-foreground);
		color: var(--color-background);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 500;
		line-height: 1.4;
	}

	.meta-divider {
		width: 0.1rem;
		height: 1rem;
		background-color: var(--color-border-strong);
	}

	.tag-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.75rem;
		border: 0.1rem solid var(--color-border);
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-muted-foreground);
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.tag-pill:hover {
		border-color: var(--color-border-strong);
		color: var(--color-foreground);
	}

	.section-icon {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		margin-top: 0.1rem;
		border: 0.1rem solid color-mix(in srgb, var(--tone) 25%, transparent);
		border-radius: var(--radius-md);
		background-color: color-mix(in srgb, var(--tone) 12%, transparent);
		color: var(--tone);
	}
	:global(:root:not(.dark)) .section-icon {
		color: color-mix(in srgb, var(--tone) 60%, #000);
	}

	.option-label {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-foreground);
	}

	.sidebar-title {
		padding: 1rem 1rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
	}

	.chip {
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		background-color: color-mix(in srgb, var(--color-foreground) 5%, transparent);
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.025em;
		color: var(--color-muted-foreground);
	}
</style>
