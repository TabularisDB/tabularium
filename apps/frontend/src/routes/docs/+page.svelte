<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import BookOpen from '@lucide/svelte/icons/book-open'
	import Braces from '@lucide/svelte/icons/braces'
	import FileJson from '@lucide/svelte/icons/file-json'
	import DeveloperPanel from '$components/docs/DeveloperPanel.svelte'
	import { m } from '$lib/paraglide/messages'

	const links = [
		{
			href: '/docs/plugin-development',
			icon: BookOpen,
			title: m.docs_plugin_dev_title(),
			body: m.docs_plugin_dev_intro(),
			reload: false,
		},
		{ href: '/openapi', icon: Braces, title: m.footer_openapi(), body: m.docs_openapi_intro(), reload: true },
		{
			href: '/api/manifest',
			icon: FileJson,
			title: m.docs_manifest_title(),
			body: m.docs_manifest_intro(),
			reload: true,
		},
	]
</script>

<svelte:head>
	<title>{m.nav_docs()}</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-14 px-6 py-12">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">{m.docs_index_title()}</h1>
		<p class="max-w-2xl text-muted-foreground">{m.docs_index_subtitle()}</p>
	</header>

	<DeveloperPanel />

	<div class="grid gap-4 md:grid-cols-3">
		{#each links as link (link.href)}
			<a
				href={link.href}
				data-sveltekit-reload={link.reload ? '' : undefined}
				class="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40 tabularis:rounded-md tabularis:border-[0.1rem]"
			>
				<span
					class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-primary"
				>
					<link.icon class="h-5 w-5" />
				</span>
				<span class="space-y-1">
					<span class="flex items-center gap-1.5 font-semibold tracking-tight group-hover:text-primary">
						{link.title}
						<ArrowRight class="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
					</span>
					<span class="block text-sm text-muted-foreground">{link.body}</span>
				</span>
			</a>
		{/each}
	</div>
</div>
