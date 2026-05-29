<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { m } from '$lib/paraglide/messages'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import FieldTable from '$components/docs/FieldTable.svelte'
	import ArrowLeft from '@lucide/svelte/icons/arrow-left'
	import ExternalLink from '@lucide/svelte/icons/external-link'

	type FieldDoc = {
		key: string
		type: string
		required: boolean
		description: string | null
		enumValues?: string[]
		format?: string
		deprecated?: boolean
		pattern?: string
		minLength?: number
		maxLength?: number
		minimum?: number
		maximum?: number
		minItems?: number
		maxItems?: number
	}

	type PluginDocs = {
		meta: { generatedAt: number; schemaSourceUrl: string }
		coreFields: FieldDoc[]
		globalExtensions: FieldDoc[]
		kinds: unknown[]
		customSections: unknown[]
		intro: unknown
		outro: unknown
		examples: unknown
		apiReference: { openapiSpecUrl: string; openapiUiUrl: string }
	}

	let docs = $state<PluginDocs | null>(null)
	let loadError = $state<string | null>(null)
	let loading = $state(true)

	async function load() {
		loading = true
		loadError = null
		try {
			const requested = page.url.searchParams.get('locale') ?? ''
			const qs = requested ? `?locale=${encodeURIComponent(requested)}` : ''
			const res = await fetch(`/api/docs/plugin-development${qs}`)
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			docs = (await res.json()) as PluginDocs
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load docs'
		} finally {
			loading = false
		}
	}

	onMount(load)
</script>

<svelte:head>
	<title>{m.docs_schema_title()}</title>
</svelte:head>

<div class="max-w-6xl mx-auto py-8 px-4">
	{#if loading && !docs}
		<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
	{:else if loadError}
		<p class="text-sm text-destructive">{loadError}</p>
	{:else if docs}
		<div class="lg:grid lg:grid-cols-[1fr_220px] lg:gap-8">
			<main class="space-y-8 min-w-0">
				<a
					href="/docs/plugin-development"
					class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft class="h-3 w-3" />
					{m.docs_back_to_docs()}
				</a>
				<header class="space-y-2">
					<h1 class="text-4xl font-semibold tracking-tight">{m.docs_schema_title()}</h1>
					<p class="text-lg text-muted-foreground">{m.docs_schema_subtitle()}</p>
				</header>

				<div id="core" class="scroll-mt-20">
					<Card>
						<CardHeader>
							<CardTitle class="text-lg">{m.docs_section_core()}</CardTitle>
							<CardDescription>{m.docs_section_core_subtitle()}</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldTable fields={docs.coreFields} />
						</CardContent>
					</Card>
				</div>

				<div id="extensions" class="scroll-mt-20">
					<Card>
						<CardHeader>
							<CardTitle class="text-lg">{m.docs_section_extensions()}</CardTitle>
							<CardDescription>{m.docs_section_extensions_subtitle()}</CardDescription>
						</CardHeader>
						<CardContent>
							{#if docs.globalExtensions.length > 0}
								<FieldTable fields={docs.globalExtensions} />
							{:else}
								<p class="text-sm text-muted-foreground">{m.docs_no_extensions()}</p>
							{/if}
						</CardContent>
					</Card>
				</div>

				<div id="editor" class="scroll-mt-20">
					<Card class="border-dashed">
						<CardHeader>
							<CardTitle class="text-base">{m.docs_schema_editor_cta()}</CardTitle>
							<CardDescription>{m.docs_schema_editor_body()}</CardDescription>
						</CardHeader>
						<CardContent>
							<a
								href={docs.meta.schemaSourceUrl}
								class="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
								target="_blank"
								rel="noopener"
							>
								{docs.meta.schemaSourceUrl}
								<ExternalLink class="h-3 w-3 flex-shrink-0" />
							</a>
						</CardContent>
					</Card>
				</div>
			</main>

			<aside class="hidden lg:block">
				<nav class="sticky top-20 space-y-1 text-sm">
					<p class="text-xs uppercase tracking-wider text-muted-foreground mb-2">{m.docs_toc()}</p>
					<a href="#core" class="block py-1 text-muted-foreground hover:text-foreground transition-colors">
						{m.docs_section_core()}
					</a>
					<a href="#extensions" class="block py-1 text-muted-foreground hover:text-foreground transition-colors">
						{m.docs_section_extensions()}
					</a>
					<a href="#editor" class="block py-1 text-muted-foreground hover:text-foreground transition-colors">
						{m.docs_schema_editor_cta()}
					</a>
				</nav>
			</aside>
		</div>
	{/if}
</div>
