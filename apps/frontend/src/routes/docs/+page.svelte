<script lang="ts">
	import { m } from '$lib/paraglide/messages'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
</script>

<svelte:head>
	<title>Docs</title>
</svelte:head>

<div class="space-y-6 max-w-4xl mx-auto py-8 px-4">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">Documentation</h1>
	</header>
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.docs_plugin_dev_title()}</CardTitle>
			<CardDescription>{m.docs_plugin_dev_intro()}</CardDescription>
		</CardHeader>
		<CardContent>
			<a href="/docs/plugin-development" class="text-sm text-primary hover:underline">
				Open plugin development docs →
			</a>
		</CardContent>
	</Card>
</div>
