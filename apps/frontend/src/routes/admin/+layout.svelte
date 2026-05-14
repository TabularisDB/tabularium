<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { eden } from '$lib/eden'
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
	import Plug from '@lucide/svelte/icons/plug'
	import UsersRound from '@lucide/svelte/icons/users-round'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Palette from '@lucide/svelte/icons/palette'
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal'
	import ServerCog from '@lucide/svelte/icons/server-cog'
	import ShieldAlert from '@lucide/svelte/icons/shield-alert'
	import FileText from '@lucide/svelte/icons/file-text'
	import ListChecks from '@lucide/svelte/icons/list-checks'
	import ToggleRight from '@lucide/svelte/icons/toggle-right'
	import Languages from '@lucide/svelte/icons/languages'
	import Menu from '@lucide/svelte/icons/menu'
	import X from '@lucide/svelte/icons/x'
	import { auth } from '$lib/stores/auth.svelte'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'

	let { children } = $props()
	let gated = $state(true)
	let pendingCount = $state(0)
	let drawerOpen = $state(false)

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
	})

	const sections = $derived([
		{ href: '/admin', label: m.admin_nav_overview(), icon: LayoutDashboard, badge: 0 },
		{ href: '/admin/providers', label: m.admin_nav_providers(), icon: Plug, badge: 0 },
		{ href: '/admin/plugins', label: m.admin_nav_plugins(), icon: Boxes, badge: pendingCount },
		{ href: '/admin/users', label: m.admin_nav_users(), icon: UsersRound, badge: 0 },
		{ href: '/admin/pages', label: m.admin_nav_pages(), icon: FileText, badge: 0 },
		{ href: '/admin/infra', label: m.admin_nav_infrastructure(), icon: ServerCog, badge: 0 },
		{ href: '/admin/branding', label: m.admin_nav_branding(), icon: Palette, badge: 0 },
		{ href: '/admin/instance', label: m.admin_nav_instance(), icon: SlidersHorizontal, badge: 0 },
		{ href: '/admin/features', label: m.admin_nav_features(), icon: ToggleRight, badge: 0 },
		{ href: '/admin/i18n', label: m.admin_nav_languages(), icon: Languages, badge: 0 },
		{ href: '/admin/audit', label: m.admin_nav_audit(), icon: ListChecks, badge: 0 },
	])

	function isActive(href: string) {
		if (href === '/admin') return page.url.pathname === '/admin'
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/')
	}

	const activeLabel = $derived(sections.find((s) => isActive(s.href))?.label ?? m.admin_nav_default_label())

	$effect(() => {
		// Close drawer on route change.
		void page.url.pathname
		drawerOpen = false
	})
</script>

{#if gated}
	<div class="mx-auto max-w-md px-6 py-20 text-center text-sm text-muted-foreground">
		{m.admin_nav_checking()}
	</div>
{:else}
	<!-- Mobile top-bar -->
	<div class="lg:hidden sticky top-[4.5rem] z-30 border-b border-border bg-background/95 backdrop-blur-md">
		<div class="mx-auto max-w-7xl px-6 h-12 flex items-center justify-between gap-3">
			<div class="flex items-center gap-2 text-sm font-semibold">
				<ShieldAlert class="h-4 w-4 text-primary" />
				<span>{activeLabel}</span>
				{#if pendingCount > 0 && activeLabel !== m.admin_nav_plugins()}
					<span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 text-warning text-[10px] font-semibold px-1.5">{pendingCount}</span>
				{/if}
			</div>
			<button type="button" onclick={() => (drawerOpen = !drawerOpen)} class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent" aria-label={m.admin_nav_toggle_menu()}>
				{#if drawerOpen}<X class="h-4 w-4" />{:else}<Menu class="h-4 w-4" />{/if}
			</button>
		</div>
	</div>

	<div class="mx-auto max-w-7xl px-6 py-8 grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-8">
		<!-- Sidebar (desktop) -->
		<aside class="space-y-6 hidden lg:block">
			<div class="space-y-1">
				<div class="flex items-center gap-2 text-sm font-semibold tracking-tight">
					<ShieldAlert class="h-4 w-4 text-primary" />
					{m.admin_nav_panel_title()}
				</div>
				<p class="text-xs text-muted-foreground">{m.admin_nav_panel_subtitle()}</p>
			</div>
			<nav class="space-y-0.5">
				{#each sections as s (s.href)}
					{@const Icon = s.icon}
					<a
						href={s.href}
						class={cn(
							'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
							isActive(s.href)
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
						)}
					>
						<span class="flex items-center gap-2">
							<Icon class="h-4 w-4" />
							{s.label}
						</span>
						{#if s.badge > 0}
							<span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 text-warning text-[10px] font-semibold px-1.5">{s.badge}</span>
						{/if}
					</a>
				{/each}
			</nav>
		</aside>

		<section class="space-y-6 min-w-0">
			{@render children()}
		</section>
	</div>

	<!-- Mobile drawer -->
	{#if drawerOpen}
		<div class="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" role="dialog" aria-modal="true">
			<button type="button" class="absolute inset-0" onclick={() => (drawerOpen = false)} aria-label={m.admin_nav_close_menu()}></button>
			<aside class="relative ml-auto h-full w-72 max-w-[80vw] border-l border-border bg-background p-6 space-y-6 overflow-y-auto">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2 text-sm font-semibold">
						<ShieldAlert class="h-4 w-4 text-primary" />
						{m.admin_nav_panel_title()}
					</div>
					<button type="button" onclick={() => (drawerOpen = false)} class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" aria-label={m.common_close()}>
						<X class="h-4 w-4" />
					</button>
				</div>
				<nav class="space-y-0.5">
					{#each sections as s (s.href)}
						{@const Icon = s.icon}
						<a
							href={s.href}
							class={cn(
								'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
								isActive(s.href)
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
							)}
						>
							<span class="flex items-center gap-2">
								<Icon class="h-4 w-4" />
								{s.label}
							</span>
							{#if s.badge > 0}
								<span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 text-warning text-[10px] font-semibold px-1.5">{s.badge}</span>
							{/if}
						</a>
					{/each}
				</nav>
			</aside>
		</div>
	{/if}
{/if}
