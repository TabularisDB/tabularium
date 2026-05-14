<script lang="ts">
	import { page } from '$app/state'
	import { onMount } from 'svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import Button from '$components/ui/Button.svelte'
	import CmsPage from '$components/CmsPage.svelte'
	import { eden } from '$lib/eden'
	import type { PageRendered } from '$lib/types'

	const path = $derived('/' + page.params.path)
	let pageData = $state<PageRendered | null>(null)
	let loading = $state(true)
	let notFound = $state(false)

	async function load() {
		loading = true
		notFound = false
		pageData = null
		const { data, error } = await eden.api.pages['by-path'].get({ query: { path } })
		if (error) {
			if (error.status === 404) notFound = true
		} else {
			pageData = data as PageRendered
		}
		loading = false
	}

	onMount(load)
	$effect(() => {
		void path
		load()
	})
</script>

<svelte:head>
	{#if pageData}<title>{pageData.title}</title>{/if}
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12 space-y-6">
	{#if loading}
		<Skeleton class="h-10 w-1/2 rounded-md" />
		<Skeleton class="h-64 w-full rounded-md" />
	{:else if notFound}
		<div class="rounded-lg border border-dashed border-border p-12 text-center space-y-3">
			<p class="text-muted-foreground">404 — no page at <code class="font-mono">{path}</code>.</p>
			<Button size="sm" variant="outline" href="/">Back home</Button>
		</div>
	{:else if pageData}
		<header class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">{pageData.title}</h1>
		</header>
		<CmsPage html={pageData.html} />
	{/if}
</div>
