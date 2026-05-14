<script lang="ts">
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { toast } from 'svelte-sonner'
	import Boxes from '@lucide/svelte/icons/boxes'
	import LogIn from '@lucide/svelte/icons/log-in'
	import LogOut from '@lucide/svelte/icons/log-out'
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import Button from '$components/ui/Button.svelte'
	import ThemeToggle from '$components/ThemeToggle.svelte'
	import LanguageSwitcher from '$components/LanguageSwitcher.svelte'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { features } from '$lib/stores/features.svelte'
	import { m } from '$lib/paraglide/messages'

	const navLinks = $derived([
		{ href: '/plugins', label: m.nav_plugins(), show: true },
		{ href: '/requests', label: m.nav_requests(), show: features.requestsEnabled },
		{ href: '/submit', label: m.nav_submit(), show: features.submissionsEnabled },
	].filter((l) => l.show))

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
</script>

<header class="border-b border-border sticky top-0 z-40 bg-background/80 backdrop-blur-md">
	<div class="mx-auto max-w-6xl px-6 h-[4.5rem] flex items-center gap-8">
		<a href="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
			{#if branding.logoUrl}
				<img src={branding.logoUrl} alt={branding.name} class="h-8 w-8 rounded-md object-contain" />
			{:else}
				<span class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Boxes class="h-4 w-4" />
				</span>
			{/if}
			<span>{branding.name}</span>
		</a>

		<nav class="flex items-center gap-1 text-sm">
			{#each navLinks as link}
				<Button variant="ghost" size="sm" href={link.href}>
					<span class={isActive(link.href) ? 'text-foreground' : 'text-muted-foreground'}>{link.label}</span>
				</Button>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-2">
			<LanguageSwitcher />
			<ThemeToggle />
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
	</div>
</header>
