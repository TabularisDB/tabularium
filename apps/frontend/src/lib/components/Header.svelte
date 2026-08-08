<script lang="ts">
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { toast } from 'svelte-sonner'
	import Boxes from '@lucide/svelte/icons/boxes'
	import LogIn from '@lucide/svelte/icons/log-in'
	import LogOut from '@lucide/svelte/icons/log-out'
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import Menu from '@lucide/svelte/icons/menu'
	import X from '@lucide/svelte/icons/x'
	import Button from '$components/ui/Button.svelte'
	import ThemeToggle from '$components/ThemeToggle.svelte'
	import LanguageSwitcher from '$components/LanguageSwitcher.svelte'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { features } from '$lib/stores/features.svelte'
	import { instanceInfo } from '$lib/stores/instance-info.svelte'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'

	let mobileOpen = $state(false)

	const navLinks = $derived(
		[
			{ href: '/plugins', label: m.nav_plugins(), show: true },
			{ href: instanceInfo.docsExternalUrl ?? '/docs/plugin-development', label: m.nav_docs(), show: true },
			{ href: '/requests', label: m.nav_requests(), show: features.requestsEnabled },
			{ href: '/submit', label: m.nav_submit(), show: features.submissionsEnabled },
		].filter((l) => l.show),
	)

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/')
	}

	async function signOut() {
		try {
			await auth.logout()
			toast.success('Signed out')
			goto('/')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to sign out')
		}
	}

	$effect(() => {
		// Close the mobile menu on route change.
		void page.url.pathname
		mobileOpen = false
	})

	const mobileLinkClass = (active: boolean) =>
		cn(
			'block rounded-md px-3 py-2 text-sm transition-colors',
			active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
		)
</script>

<header class="border-b border-border sticky top-0 z-40 bg-background/80 backdrop-blur-md">
	<div class="mx-auto max-w-6xl px-4 sm:px-6 h-[4.5rem] flex items-center gap-4 md:gap-8">
		<a href="/" class="flex items-center gap-2.5 font-semibold tracking-tight min-w-0">
			{#if branding.logoUrl}
				<img src={branding.logoUrl} alt={branding.name} class="h-8 w-8 rounded-md object-contain" />
			{:else}
				<span class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Boxes class="h-4 w-4" />
				</span>
			{/if}
			<span class="truncate">{branding.name}</span>
		</a>

		<nav class="hidden md:flex items-center gap-1 text-sm">
			{#each navLinks as link}
				<Button variant="ghost" size="sm" href={link.href}>
					<span class={isActive(link.href) ? 'text-foreground' : 'text-muted-foreground'}>{link.label}</span>
				</Button>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-2">
			<LanguageSwitcher />
			<ThemeToggle />
			<div class="hidden md:flex items-center gap-2">
				{#if auth.isAdmin}
					<Button variant="ghost" size="sm" href="/admin">
						<ShieldCheck class="h-3.5 w-3.5" />
						{m.nav_admin()}
					</Button>
				{/if}
				{#if auth.user}
					<Button variant="ghost" size="sm" href="/settings">
						<span class="text-muted-foreground">@</span>
						<span class="font-medium">{auth.user.displayName}</span>
					</Button>
					<Button variant="ghost" size="sm" onclick={signOut} aria-label={m.nav_sign_out()} title={m.nav_sign_out()}>
						<LogOut class="h-3.5 w-3.5" />
					</Button>
				{:else}
					<Button variant="outline" size="sm" href="/login">
						<LogIn class="h-3.5 w-3.5" />
						{m.nav_sign_in()}
					</Button>
				{/if}
			</div>
			<button
				type="button"
				onclick={() => (mobileOpen = !mobileOpen)}
				class="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
				aria-label={m.nav_toggle_menu()}
				aria-expanded={mobileOpen}
			>
				{#if mobileOpen}<X class="h-4 w-4" />{:else}<Menu class="h-4 w-4" />{/if}
			</button>
		</div>
	</div>

	{#if mobileOpen}
		<nav class="md:hidden border-t border-border bg-background px-4 py-3 space-y-1">
			{#each navLinks as link}
				<a href={link.href} class={mobileLinkClass(isActive(link.href))}>{link.label}</a>
			{/each}
			{#if auth.isAdmin}
				<a href="/admin" class={mobileLinkClass(isActive('/admin'))}>
					<span class="flex items-center gap-2"><ShieldCheck class="h-3.5 w-3.5" />{m.nav_admin()}</span>
				</a>
			{/if}
			{#if auth.user}
				<a href="/settings" class={mobileLinkClass(isActive('/settings'))}>
					<span class="flex items-center gap-2">
						<span class="text-muted-foreground">@</span>
						<span class="font-medium">{auth.user.displayName}</span>
					</span>
				</a>
				<button type="button" onclick={signOut} class={cn(mobileLinkClass(false), 'w-full text-left')}>
					<span class="flex items-center gap-2"><LogOut class="h-3.5 w-3.5" />{m.nav_sign_out()}</span>
				</button>
			{:else}
				<a href="/login" class={mobileLinkClass(isActive('/login'))}>
					<span class="flex items-center gap-2"><LogIn class="h-3.5 w-3.5" />{m.nav_sign_in()}</span>
				</a>
			{/if}
		</nav>
	{/if}
</header>
