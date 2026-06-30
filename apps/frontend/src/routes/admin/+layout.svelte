<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { browser } from '$app/environment'
	import { eden } from '$lib/eden'
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
	import Plug from '@lucide/svelte/icons/plug'
	import UsersRound from '@lucide/svelte/icons/users-round'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Palette from '@lucide/svelte/icons/palette'
	import House from '@lucide/svelte/icons/house'
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal'
	import ServerCog from '@lucide/svelte/icons/server-cog'
	import ShieldAlert from '@lucide/svelte/icons/shield-alert'
	import FileText from '@lucide/svelte/icons/file-text'
	import ListChecks from '@lucide/svelte/icons/list-checks'
	import ToggleRight from '@lucide/svelte/icons/toggle-right'
	import Tags from '@lucide/svelte/icons/tags'
	import FileJson from '@lucide/svelte/icons/file-json'
	import BookText from '@lucide/svelte/icons/book-text'
	import KeyRound from '@lucide/svelte/icons/key-round'
	import Languages from '@lucide/svelte/icons/languages'
	import Mail from '@lucide/svelte/icons/mail'
	import Send from '@lucide/svelte/icons/send'
	import Gauge from '@lucide/svelte/icons/gauge'
	import FileCode2 from '@lucide/svelte/icons/file-code-2'
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import Rocket from '@lucide/svelte/icons/rocket'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import X from '@lucide/svelte/icons/x'
	import AdminTopBar from '$components/admin/AdminTopBar.svelte'
	import type { Component } from 'svelte'
	import { auth } from '$lib/stores/auth.svelte'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'

	let { children } = $props()
	let gated = $state(true)
	let pendingCount = $state(0)
	let drawerOpen = $state(false)

	// Wire shape returned by GET /api/plugin-contributions. Mirrors
	// NavEntryContribution in @tabularium/plugin-host-types — kept structurally
	// duplicated so the frontend doesn't take a runtime dep on the kernel.
	type PluginNavEntry = {
		id: string
		href?: string
		labelKey: string
		icon: string
		order?: number
		parent?: string
		children?: PluginNavEntry[]
	}
	let pluginNav = $state<PluginNavEntry[]>([])

	// String → icon component lookup. Core uses imported components directly;
	// plugin contributions reference icons by string name. SP1: hand-maintain.
	// Future TODO: dynamic icon loading.
	const ICON_MAP: Record<string, Component> = {
		'layout-dashboard': LayoutDashboard,
		plug: Plug,
		boxes: Boxes,
		'users-round': UsersRound,
		'file-text': FileText,
		'server-cog': ServerCog,
		palette: Palette,
		mail: Mail,
		send: Send,
		house: House,
		'shield-alert': ShieldAlert,
		'sliders-horizontal': SlidersHorizontal,
		'toggle-right': ToggleRight,
		tags: Tags,
		'file-json': FileJson,
		'book-text': BookText,
		languages: Languages,
		'key-round': KeyRound,
		'list-checks': ListChecks,
	}

	onMount(async () => {
		if (!auth.loaded) await auth.refresh()
		if (!auth.isAdmin) {
			goto('/')
			return
		}
		try {
			const { data, error } = await eden.api.init.status.get()
			if (error) throw error
			const status = data as { setupCompleted: boolean }
			if (!status.setupCompleted) {
				goto('/welcome')
				return
			}
		} catch {
			// allow access if status check fails — don't lock admin out
		}
		gated = false
		try {
			const { data, error } = await eden.api.admin.plugins.get({ query: { status: 'pending', limit: '1' } })
			if (error) throw error
			pendingCount = (data as { total: number }).total
		} catch {
			// ignore
		}
		try {
			const res = await fetch('/api/plugin-contributions')
			if (res.ok) {
				const json = (await res.json()) as { points: { 'admin-nav-entry'?: PluginNavEntry[] } }
				pluginNav = json.points['admin-nav-entry'] ?? []
			}
		} catch {
			// fail open — core nav still renders
		}
	})

	// ─── Nav tree ─────────────────────────────────────────────────────────────
	// Internal node shape after merging core + plugin contributions. Built
	// recursively so groups can themselves contain groups.

	type NavNode = {
		id: string
		href?: string
		label: string
		icon: Component
		badge: number
		order: number
		children?: NavNode[]
		/**
		 * When true, `isActive` only fires on EXACT pathname match instead of
		 * prefix match. Set automatically at tree-build time when a child shares
		 * the same href as its parent (e.g. instance/general lives at the same
		 * URL as the instance landing) — without it, both the child and a
		 * deeper-route sibling (recovery, security…) would flag as active.
		 */
		exact?: boolean
	}

	function labelFor(key: string): string {
		return (m as unknown as Record<string, () => string>)[key]?.() ?? key
	}

	function pluginToNode(p: PluginNavEntry): NavNode {
		return {
			id: p.id,
			href: p.href,
			label: labelFor(p.labelKey),
			icon: ICON_MAP[p.icon] ?? Plug,
			badge: 0,
			order: p.order ?? 200,
			children: p.children?.map(pluginToNode).sort((a, b) => a.order - b.order),
		}
	}

	function findNode(tree: NavNode[], id: string): NavNode | null {
		for (const n of tree) {
			if (n.id === id) return n
			if (n.children) {
				const hit = findNode(n.children, id)
				if (hit) return hit
			}
		}
		return null
	}

	function attachToParent(tree: NavNode[], parentId: string, child: NavNode): boolean {
		const parent = findNode(tree, parentId)
		if (!parent) return false
		parent.children = [...(parent.children ?? []), child].sort((a, b) => a.order - b.order)
		return true
	}

	const tree = $derived.by<NavNode[]>(() => {
		// Core sections — give each a stable id so plugin entries can target them
		// via the `parent` field.
		const root: NavNode[] = [
			{ id: 'overview', href: '/admin', label: m.admin_nav_overview(), icon: LayoutDashboard, badge: 0, order: 0 },
			{ id: 'providers', href: '/admin/providers', label: m.admin_nav_providers(), icon: Plug, badge: 0, order: 10 },
			{
				id: 'plugins',
				href: '/admin/plugins',
				label: m.admin_nav_plugins(),
				icon: Boxes,
				badge: pendingCount,
				order: 20,
			},
			{ id: 'users', href: '/admin/users', label: m.admin_nav_users(), icon: UsersRound, badge: 0, order: 30 },
			{ id: 'pages', href: '/admin/pages', label: m.admin_nav_pages(), icon: FileText, badge: 0, order: 40 },
			{
				id: 'infra',
				href: '/admin/infra',
				label: m.admin_nav_infrastructure(),
				icon: ServerCog,
				badge: 0,
				order: 50,
				children: [
					{
						id: 'infra-overview',
						href: '/admin/infra',
						label: m.admin_nav_overview(),
						icon: ServerCog,
						badge: 0,
						order: 10,
					},
					{
						id: 'infra-plugins',
						href: '/admin/infra/plugins',
						label: m.admin_infra_plugins_title(),
						icon: Boxes,
						badge: 0,
						order: 20,
					},
				],
			},
			{ id: 'branding', href: '/admin/branding', label: m.admin_nav_branding(), icon: Palette, badge: 0, order: 60 },
			{ id: 'home', href: '/admin/home', label: m.admin_nav_home(), icon: House, badge: 0, order: 70 },
			{
				id: 'instance',
				href: '/admin/instance',
				label: m.admin_nav_instance(),
				icon: SlidersHorizontal,
				badge: 0,
				order: 80,
				children: [
					{
						id: 'instance-general',
						href: '/admin/instance',
						label: m.admin_instance_tab_general(),
						icon: SlidersHorizontal,
						badge: 0,
						order: 10,
					},
					{
						id: 'instance-rate-limits',
						href: '/admin/instance/rate-limits',
						label: m.admin_instance_tab_rate_limits(),
						icon: Gauge,
						badge: 0,
						order: 20,
					},
					{
						id: 'instance-manifest',
						href: '/admin/instance/manifest',
						label: m.admin_instance_tab_manifest(),
						icon: FileCode2,
						badge: 0,
						order: 30,
					},
					{
						id: 'instance-recovery',
						href: '/admin/instance/recovery',
						label: m.admin_instance_tab_recovery(),
						icon: KeyRound,
						badge: 0,
						order: 40,
					},
					{
						id: 'instance-security',
						href: '/admin/instance/security',
						label: m.admin_instance_tab_security(),
						icon: ShieldCheck,
						badge: 0,
						order: 50,
					},
					{
						id: 'instance-app-handoff',
						href: '/admin/instance/app-handoff',
						label: m.admin_instance_tab_app_handoff(),
						icon: Rocket,
						badge: 0,
						order: 60,
					},
				],
			},
			{
				id: 'features',
				href: '/admin/features',
				label: m.admin_nav_features(),
				icon: ToggleRight,
				badge: 0,
				order: 85,
			},
			{ id: 'kinds', href: '/admin/kinds', label: m.admin_nav_kinds(), icon: Tags, badge: 0, order: 90 },
			{ id: 'manifest', href: '/admin/manifest', label: m.admin_nav_manifest(), icon: FileJson, badge: 0, order: 100 },
			{ id: 'docs', href: '/admin/docs', label: m.admin_nav_docs(), icon: BookText, badge: 0, order: 110 },
			{ id: 'i18n', href: '/admin/i18n', label: m.admin_nav_languages(), icon: Languages, badge: 0, order: 120 },
			{ id: 'tokens', href: '/admin/tokens', label: m.admin_nav_tokens(), icon: KeyRound, badge: 0, order: 130 },
			{ id: 'audit', href: '/admin/audit', label: m.admin_nav_audit(), icon: ListChecks, badge: 0, order: 140 },
		]

		// Two passes over plugin entries so that:
		//   1. group-providing plugins land first (they may be the parent target
		//      another plugin wants to attach to),
		//   2. parent-attaching plugins resolve against the now-populated tree.
		// Within each pass, sort by order so dependency hints stay deterministic.
		const sortedPlugins = [...pluginNav].sort((a, b) => (a.order ?? 200) - (b.order ?? 200))
		const groupProviders = sortedPlugins.filter((p) => !p.parent)
		const attachers = sortedPlugins.filter((p) => p.parent)

		for (const p of groupProviders) root.push(pluginToNode(p))

		for (const p of attachers) {
			const node = pluginToNode(p)
			if (!attachToParent(root, p.parent!, node)) {
				// Parent missing — degrade to top-level rather than dropping the entry.
				if (browser) console.warn(`[admin-nav] parent "${p.parent}" not found for "${p.id}" — rendering at top level`)
				root.push(node)
			}
		}

		root.sort((a, b) => a.order - b.order)
		flagExactChildren(root)
		return root
	})

	// Walk the tree post-merge: any child whose href equals its parent's href
	// renders as a "default tab" of the parent's landing page; flag it as exact
	// so it stops swallowing the active state when a sibling sub-route is open.
	function flagExactChildren(nodes: NavNode[]) {
		for (const n of nodes) {
			if (n.children) {
				for (const c of n.children) {
					if (c.href && c.href === n.href) c.exact = true
				}
				flagExactChildren(n.children)
			}
		}
	}

	// ─── Active route + expansion state ───────────────────────────────────────

	function isActive(node: NavNode): boolean {
		if (!node.href) return false
		if (node.exact) return page.url.pathname === node.href
		if (node.href === '/admin') return page.url.pathname === '/admin'
		return page.url.pathname === node.href || page.url.pathname.startsWith(node.href + '/')
	}

	function nodeHasActiveDescendant(node: NavNode): boolean {
		if (!node.children) return false
		return node.children.some((c) => isActive(c) || nodeHasActiveDescendant(c))
	}

	const EXPAND_STORAGE_KEY = 'admin-nav-expanded'

	// Persisted user toggles. A node id maps to:
	//   - true  → user explicitly expanded
	//   - false → user explicitly collapsed (overrides auto-expand on active)
	let userExpanded = $state<Record<string, boolean>>({})

	onMount(() => {
		if (!browser) return
		try {
			const raw = localStorage.getItem(EXPAND_STORAGE_KEY)
			if (raw) userExpanded = JSON.parse(raw) as Record<string, boolean>
		} catch {
			// localStorage unavailable or JSON corrupt — silent fallback
		}
	})

	function isExpanded(node: NavNode): boolean {
		const explicit = userExpanded[node.id]
		if (explicit !== undefined) return explicit
		// Default: expand if any descendant is the active route, so the user
		// always sees where they are without needing to hunt for a chevron.
		return nodeHasActiveDescendant(node)
	}

	function toggleExpanded(id: string) {
		const node = findNode(tree, id)
		if (!node) return
		const current = isExpanded(node)
		userExpanded = { ...userExpanded, [id]: !current }
		if (browser) {
			try {
				localStorage.setItem(EXPAND_STORAGE_KEY, JSON.stringify(userExpanded))
			} catch {
				// ignore
			}
		}
	}

	// Walks the tree returning the chain of ancestors from root to the active
	// leaf (inclusive). Used by the top-bar breadcrumb.
	const activePath = $derived.by<NavNode[]>(() => {
		function search(nodes: NavNode[], chain: NavNode[]): NavNode[] | null {
			for (const n of nodes) {
				const next = [...chain, n]
				if (isActive(n) && (!n.children || !n.children.length)) return next
				if (n.children) {
					const hit = search(n.children, next)
					if (hit) return hit
				}
			}
			for (const n of nodes) {
				if (isActive(n)) return [...chain, n]
			}
			return null
		}
		return search(tree, []) ?? []
	})

	const crumbs = $derived(
		[{ label: m.admin_topbar_dashboard(), href: '/admin' }, ...activePath.filter((n) => n.id !== 'overview').map((n) => ({ label: n.label, href: n.href }))],
	)

	$effect(() => {
		// Close drawer on route change.
		void page.url.pathname
		drawerOpen = false
	})
</script>

{#snippet leafLink(node: NavNode, depth: number)}
	{@const Icon = node.icon}
	<a
		href={node.href}
		class={cn(
			'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
			depth > 0 && 'ml-6 pl-2 text-[13px]',
			isActive(node)
				? 'bg-accent text-foreground'
				: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
		)}
	>
		<span class="flex items-center gap-2 min-w-0">
			<Icon class="h-4 w-4 shrink-0" />
			<span class="truncate">{node.label}</span>
		</span>
		{#if node.badge > 0}
			<span
				class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 text-warning text-[10px] font-semibold px-1.5"
				>{node.badge}</span
			>
		{/if}
	</a>
{/snippet}

{#snippet groupHeader(node: NavNode, depth: number)}
	{@const expanded = isExpanded(node)}
	{@const Icon = node.icon}
	<div
		class={cn(
			'flex items-center gap-1 rounded-md text-sm transition-colors',
			depth > 0 && 'ml-6 text-[13px]',
			isActive(node) || nodeHasActiveDescendant(node)
				? 'bg-accent/60 text-foreground'
				: 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
		)}
	>
		{#if node.href}
			<a href={node.href} class="flex items-center gap-2 px-3 py-2 flex-1 min-w-0">
				<Icon class="h-4 w-4 shrink-0" />
				<span class="truncate flex-1">{node.label}</span>
				{#if node.badge > 0}
					<span
						class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 text-warning text-[10px] font-semibold px-1.5"
						>{node.badge}</span
					>
				{/if}
			</a>
		{:else}
			<button
				type="button"
				onclick={() => toggleExpanded(node.id)}
				class="flex items-center gap-2 px-3 py-2 flex-1 min-w-0 text-left"
			>
				<Icon class="h-4 w-4 shrink-0" />
				<span class="truncate flex-1">{node.label}</span>
			</button>
		{/if}
		<button
			type="button"
			onclick={() => toggleExpanded(node.id)}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent shrink-0 mr-1"
			aria-label={expanded ? m.admin_nav_collapse({ label: node.label }) : m.admin_nav_expand({ label: node.label })}
			aria-expanded={expanded}
		>
			<ChevronRight class={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
		</button>
	</div>
{/snippet}

{#snippet navNode(node: NavNode, depth: number)}
	{#if node.children && node.children.length > 0}
		{@render groupHeader(node, depth)}
		{#if isExpanded(node)}
			<div class="space-y-0.5">
				{#each node.children as child (child.id)}
					{@render navNode(child, depth + 1)}
				{/each}
			</div>
		{/if}
	{:else}
		{@render leafLink(node, depth)}
	{/if}
{/snippet}

{#if gated}
	<div class="mx-auto max-w-md px-6 py-20 text-center text-sm text-muted-foreground">
		{m.admin_nav_checking()}
	</div>
{:else}
	<!-- Full-bleed admin shell: top-bar spans width, sidebar sticks under it. -->
	<div class="min-h-screen flex flex-col bg-muted/30 dark:bg-background">
		<AdminTopBar {crumbs} {pendingCount} onToggleDrawer={() => (drawerOpen = !drawerOpen)} />

		<div class="flex-1 flex">
			<!-- Sidebar (desktop) -->
			<aside
				class="hidden lg:flex sticky top-14 h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-border bg-background flex-col"
			>
				<nav class="flex-1 overflow-y-auto p-3 space-y-0.5">
					{#each tree as node (node.id)}
						{@render navNode(node, 0)}
					{/each}
				</nav>
				<div class="border-t border-border px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider">
					{m.admin_nav_panel_title()}
				</div>
			</aside>

			<section class="flex-1 min-w-0 px-4 lg:px-8 py-6 lg:py-8 space-y-6">
				{@render children()}
			</section>
		</div>
	</div>

	<!-- Mobile drawer -->
	{#if drawerOpen}
		<div class="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" role="dialog" aria-modal="true">
			<button
				type="button"
				class="absolute inset-0"
				onclick={() => (drawerOpen = false)}
				aria-label={m.admin_nav_close_menu()}
			></button>
			<aside
				class="relative h-full w-72 max-w-[80vw] border-r border-border bg-background flex flex-col"
			>
				<div class="flex items-center justify-between p-4 border-b border-border">
					<div class="flex items-center gap-2 text-sm font-semibold">
						<ShieldAlert class="h-4 w-4 text-primary" />
						{m.admin_nav_panel_title()}
					</div>
					<button
						type="button"
						onclick={() => (drawerOpen = false)}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
						aria-label={m.common_close()}
					>
						<X class="h-4 w-4" />
					</button>
				</div>
				<nav class="flex-1 overflow-y-auto p-3 space-y-0.5">
					{#each tree as node (node.id)}
						{@render navNode(node, 0)}
					{/each}
				</nav>
			</aside>
		</div>
	{/if}
{/if}
