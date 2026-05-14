<script lang="ts">
	import './layout.css'
	import { onMount } from 'svelte'
	import { Toaster } from 'svelte-sonner'
	import { ModeWatcher } from 'mode-watcher'
	import Header from '$components/Header.svelte'
	import Footer from '$components/Footer.svelte'
	import { auth } from '$lib/stores/auth.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { features } from '$lib/stores/features.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'

	let { children } = $props()

	onMount(() => {
		i18n.refresh()
		auth.refresh()
		branding.refresh()
		features.refresh()
	})
</script>

<ModeWatcher />

<svelte:head>
	<title>{branding.name}</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<Header />
	<main class="flex-1">
		{@render children()}
	</main>
	<Footer />
</div>

<Toaster theme="system" richColors />
