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
	import CodeExample from '$components/docs/CodeExample.svelte'

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

	type PositionMarker =
		| 'page_top'
		| 'page_bottom'
		| 'before_core'
		| 'after_core'
		| 'before_extensions'
		| 'after_extensions'
		| 'before_kinds'
		| 'after_kinds'
		| 'before_api'
		| 'after_api'
		| { kind: string; slot: 'before' | 'after' }

	type CustomSection = {
		id: string
		title: string | null
		bodyHtml: string
		position: PositionMarker
	}

	type KindDocSection = {
		key: string
		label: string
		description: string | null
		publicPageUrl: string | null
		extensionFields: FieldDoc[]
		prosePreHtml: string | null
		prosePostHtml: string | null
	}

	type KindExample = { kindKey: string; yaml: string; json: string }

	type PluginDocs = {
		meta: { generatedAt: number; schemaSourceUrl: string }
		intro: { bodyHtml: string | null }
		outro: { bodyHtml: string | null }
		customSections: CustomSection[]
		coreFields: FieldDoc[]
		globalExtensions: FieldDoc[]
		kinds: KindDocSection[]
		examples: { perKind: KindExample[] }
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

	function sectionsAt(marker: PositionMarker, sections: CustomSection[]): CustomSection[] {
		if (typeof marker === 'string') {
			return sections.filter((s) => typeof s.position === 'string' && s.position === marker)
		}
		return sections.filter(
			(s) => typeof s.position === 'object' && s.position.kind === marker.kind && s.position.slot === marker.slot,
		)
	}

	const topPositions: PositionMarker[] = [
		'page_top',
		'before_core',
		'after_core',
		'before_extensions',
		'after_extensions',
		'before_kinds',
	]
	const bottomPositions: PositionMarker[] = ['after_kinds', 'page_bottom']
</script>

<svelte:head>
	<title>{m.docs_plugin_dev_title()}</title>
</svelte:head>

<div class="max-w-6xl mx-auto py-8 px-4">
	{#if loading && !docs}
		<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
	{:else if loadError}
		<p class="text-sm text-destructive">{loadError}</p>
	{:else if docs}
		<div class="lg:grid lg:grid-cols-[1fr_220px] lg:gap-8">
			<main class="space-y-10 min-w-0">
				<header class="space-y-3">
					<h1 class="text-4xl font-semibold tracking-tight">{m.docs_plugin_dev_title()}</h1>
					{#if docs.intro.bodyHtml}
						<div class="prose dark:prose-invert max-w-none">{@html docs.intro.bodyHtml}</div>
					{:else}
						<p class="text-lg text-muted-foreground">{m.docs_plugin_dev_intro()}</p>
					{/if}
				</header>

				{#each topPositions as pos (pos)}
					{#each sectionsAt(pos, docs.customSections) as section (section.id)}
						<section id={`section-${section.id}`} class="space-y-2 scroll-mt-20">
							{#if section.title}
								<h2 class="text-2xl font-semibold tracking-tight">{section.title}</h2>
							{/if}
							<div class="prose dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
						</section>
					{/each}
				{/each}

				{#if docs.kinds.length > 0}
					<section class="space-y-6">
						<header class="space-y-1">
							<h2 id="kinds" class="text-2xl font-semibold tracking-tight scroll-mt-20">
								{m.docs_section_kinds()}
							</h2>
							<p class="text-sm text-muted-foreground">{m.docs_section_kinds_subtitle()}</p>
						</header>
						{#each docs.kinds as kind (kind.key)}
							{#each sectionsAt({ kind: kind.key, slot: 'before' }, docs.customSections) as section (section.id)}
								<section id={`section-${section.id}`} class="space-y-2 scroll-mt-20">
									{#if section.title}
										<h3 class="text-lg font-semibold tracking-tight">{section.title}</h3>
									{/if}
									<div class="prose dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
								</section>
							{/each}
							<div id={`kind-${kind.key}`} class="scroll-mt-20">
								<Card>
									<CardHeader>
										<CardTitle class="text-lg">
											{kind.label}
											{#if kind.publicPageUrl}
												<a href={kind.publicPageUrl} class="ml-2 text-xs text-primary hover:underline">
													→ /c/{kind.key}
												</a>
											{/if}
										</CardTitle>
										{#if kind.description}
											<CardDescription>{kind.description}</CardDescription>
										{/if}
									</CardHeader>
									<CardContent class="space-y-4">
										{#if kind.prosePreHtml}
											<div class="prose dark:prose-invert max-w-none">{@html kind.prosePreHtml}</div>
										{/if}
										{#if kind.extensionFields.length > 0}
											<FieldTable fields={kind.extensionFields} />
										{/if}
										{#each docs.examples.perKind.filter((e) => e.kindKey === kind.key) as ex (ex.kindKey)}
											<CodeExample yaml={ex.yaml} json={ex.json} />
										{/each}
										{#if kind.prosePostHtml}
											<div class="prose dark:prose-invert max-w-none">{@html kind.prosePostHtml}</div>
										{/if}
									</CardContent>
								</Card>
							</div>
							{#each sectionsAt({ kind: kind.key, slot: 'after' }, docs.customSections) as section (section.id)}
								<section id={`section-${section.id}`} class="space-y-2 scroll-mt-20">
									{#if section.title}
										<h3 class="text-lg font-semibold tracking-tight">{section.title}</h3>
									{/if}
									<div class="prose dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
								</section>
							{/each}
						{/each}
					</section>
				{/if}

				{#each bottomPositions as pos (pos)}
					{#each sectionsAt(pos, docs.customSections) as section (section.id)}
						<section id={`section-${section.id}`} class="space-y-2 scroll-mt-20">
							{#if section.title}
								<h2 class="text-2xl font-semibold tracking-tight">{section.title}</h2>
							{/if}
							<div class="prose dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
						</section>
					{/each}
				{/each}

				{#if docs.outro.bodyHtml}
					<div class="prose dark:prose-invert max-w-none border-t border-border pt-8">
						{@html docs.outro.bodyHtml}
					</div>
				{/if}

				<Card class="border-dashed">
					<CardHeader>
						<CardTitle class="text-base">{m.docs_schema_link_cta()}</CardTitle>
						<CardDescription>{m.docs_schema_link_body()}</CardDescription>
					</CardHeader>
					<CardContent>
						<a
							href="/docs/plugin-development/schema"
							class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
						>
							{m.docs_schema_link_label()} →
						</a>
					</CardContent>
				</Card>
			</main>

			<aside class="hidden lg:block">
				<nav class="sticky top-20 space-y-1 text-sm">
					<p class="text-xs uppercase tracking-wider text-muted-foreground mb-2">{m.docs_toc()}</p>
					{#each docs.customSections as section (section.id)}
						{#if section.title}
							<a
								href={`#section-${section.id}`}
								class="block py-1 text-muted-foreground hover:text-foreground transition-colors"
							>
								{section.title}
							</a>
						{/if}
					{/each}
					{#if docs.kinds.length > 0}
						<p class="text-xs uppercase tracking-wider text-muted-foreground mt-4 mb-2">
							{m.docs_toc_kinds()}
						</p>
						{#each docs.kinds as kind (kind.key)}
							<a
								href={`#kind-${kind.key}`}
								class="block py-1 text-muted-foreground hover:text-foreground transition-colors"
							>
								{kind.label}
							</a>
						{/each}
					{/if}
				</nav>
			</aside>
		</div>
	{/if}
</div>
