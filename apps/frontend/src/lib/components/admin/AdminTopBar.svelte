<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { toast } from 'svelte-sonner'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Search from '@lucide/svelte/icons/search'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import LogOut from '@lucide/svelte/icons/log-out'
	import User from '@lucide/svelte/icons/user'
	import Menu from '@lucide/svelte/icons/menu'
	import ShieldAlert from '@lucide/svelte/icons/shield-alert'
	import ThemeToggle from '$components/ThemeToggle.svelte'
	import LanguageSwitcher from '$components/LanguageSwitcher.svelte'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'

	type Crumb = { label: string; href?: string }
	type Props = {
		crumbs: Crumb[]
		pendingCount?: number
		onToggleDrawer?: () => void
	}
	let { crumbs, pendingCount = 0, onToggleDrawer }: Props = $props()

	let menuOpen = $state(false)

	function closeOnEsc(e: KeyboardEvent) {
		if (e.key === 'Escape') menuOpen = false
	}

	onMount(() => {
		window.addEventListener('keydown', closeOnEsc)
		return () => window.removeEventListener('keydown', closeOnEsc)
	})

	function close() {
		menuOpen = false
	}

	async function signOut() {
		try {
			await auth.logout()
			toast.success(m.admin_topbar_signed_out())
			goto('/')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_topbar_signout_failed())
		}
	}

	const initial = $derived((auth.user?.displayName ?? auth.user?.id ?? 'A').slice(0, 1).toUpperCase())

	function openSearch() {
		// TODO: wire a real command palette. For now, focus a hidden input so
		// keyboard users get something even before the palette ships.
		toast.info(m.admin_topbar_search_coming_soon())
	}
</script>

<header
	class="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
>
	<div class="flex h-14 items-center gap-3 px-4 lg:px-6">
		<!-- Mobile hamburger -->
		{#if onToggleDrawer}
			<button
				type="button"
				onclick={onToggleDrawer}
				class="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
				aria-label={m.admin_nav_toggle_menu()}
			>
				<Menu class="h-4 w-4" />
			</button>
		{/if}

		<!-- Brand + admin pill -->
		<a href="/admin" class="flex items-center gap-2.5 font-semibold tracking-tight shrink-0">
			{#if branding.logoUrl}
				<img src={branding.logoUrl} alt={branding.name} class="h-7 w-7 rounded-md object-contain" />
			{:else}
				<span class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Boxes class="h-4 w-4" />
				</span>
			{/if}
			<span class="hidden sm:inline text-sm">{branding.name}</span>
			<span
				class="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider"
			>
				<ShieldAlert class="h-3 w-3" />Admin
			</span>
		</a>

		<!-- Breadcrumbs (hide on small screens) -->
		<nav aria-label="breadcrumb" class="hidden md:flex items-center gap-1 text-sm text-muted-foreground min-w-0">
			{#each crumbs as crumb, i (i)}
				<ChevronRight class="h-3.5 w-3.5 shrink-0 opacity-50" />
				{#if crumb.href && i < crumbs.length - 1}
					<a href={crumb.href} class="truncate hover:text-foreground transition-colors">{crumb.label}</a>
				{:else}
					<span class={cn('truncate', i === crumbs.length - 1 && 'text-foreground font-medium')}>{crumb.label}</span>
				{/if}
			{/each}
		</nav>

		<!-- Search (cmd-k stub) -->
		<button
			type="button"
			onclick={openSearch}
			class="ml-auto hidden lg:inline-flex items-center gap-2 rounded-md border border-input bg-background/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors min-w-[14rem]"
		>
			<Search class="h-3.5 w-3.5" />
			<span class="flex-1 text-left">{m.admin_topbar_search_placeholder()}</span>
			<kbd class="font-mono text-[10px] tracking-tight rounded border border-border bg-muted/50 px-1.5 py-0.5"
				>⌘K</kbd
			>
		</button>

		<!-- Mobile search icon -->
		<button
			type="button"
			onclick={openSearch}
			class="lg:hidden ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
			aria-label={m.admin_topbar_search_placeholder()}
		>
			<Search class="h-4 w-4" />
		</button>

		<div class="flex items-center gap-1 shrink-0">
			<LanguageSwitcher />
			<ThemeToggle />
		</div>

		<!-- User pill -->
		<div class="relative">
			<button
				type="button"
				onclick={() => (menuOpen = !menuOpen)}
				class="inline-flex items-center gap-2 rounded-full hover:bg-accent transition-colors pl-1 pr-2 py-1"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
			>
				<span
					class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-xs font-semibold"
				>
					{initial}
				</span>
				<span class="hidden sm:inline text-sm font-medium truncate max-w-[8rem]">
					{auth.user?.displayName ?? auth.user?.id ?? m.admin_topbar_account()}
				</span>
			</button>

			{#if menuOpen}
				<button
					type="button"
					class="fixed inset-0 z-30 cursor-default"
					onclick={close}
					aria-label={m.common_close()}
				></button>
				<div
					class="absolute right-0 top-full mt-2 z-40 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
					role="menu"
				>
					<div class="px-3 py-2.5 border-b border-border">
						<div class="text-sm font-medium truncate">{auth.user?.displayName ?? auth.user?.id}</div>
						{#if auth.user?.username && auth.user.username !== auth.user.displayName}
							<div class="text-xs text-muted-foreground truncate">@{auth.user.username}</div>
						{/if}
					</div>
					<a
						href="/settings"
						onclick={close}
						class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
					>
						<User class="h-4 w-4" />
						{m.admin_topbar_my_settings()}
					</a>
					<a
						href="/"
						onclick={close}
						class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
					>
						<ExternalLink class="h-4 w-4" />
						{m.admin_topbar_back_to_site()}
					</a>
					<div class="border-t border-border">
						<button
							type="button"
							onclick={() => {
								close()
								void signOut()
							}}
							class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-destructive transition-colors text-left"
						>
							<LogOut class="h-4 w-4" />
							{m.admin_topbar_sign_out()}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if pendingCount > 0}
		<div class="border-t border-warning/30 bg-warning/5 text-warning text-xs px-4 lg:px-6 py-1.5 flex items-center gap-2">
			<ShieldAlert class="h-3.5 w-3.5 shrink-0" />
			<span class="truncate"
				>{m.admin_topbar_pending_banner({ count: pendingCount.toString() })}
				<a href="/admin/plugins?status=pending" class="underline underline-offset-2 hover:text-warning-foreground"
					>{m.admin_topbar_review_now()} →</a
				></span
			>
		</div>
	{/if}
</header>
