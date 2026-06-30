<script lang="ts">
	import './layout.css'
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { Toaster } from 'svelte-sonner'
	import { ModeWatcher } from 'mode-watcher'
	import Header from '$components/Header.svelte'
	import Footer from '$components/Footer.svelte'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { features } from '$lib/stores/features.svelte'
	import { homeCopy } from '$lib/stores/home-copy.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'

	let { children } = $props()

	// Admin section has its own chrome (sidebar + admin top-bar). Skip the
	// public header/footer so it can render full-bleed like WordPress wp-admin.
	const inAdmin = $derived(page.url.pathname.startsWith('/admin'))

	onMount(() => {
		i18n.refresh()
		auth.refresh()
		branding.refresh()
		features.refresh()
		homeCopy.refresh()
	})
</script>

<ModeWatcher />

<svelte:head>
	<title>{branding.name}</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	{#if !inAdmin}<Header />{/if}
	<main class="flex-1">
		{@render children()}
	</main>
	{#if !inAdmin}<Footer />{/if}
</div>

<Toaster theme="system" richColors />
