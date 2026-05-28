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
</script>

<svelte:head>
	<title>{m.docs_plugin_dev_title()}</title>
</svelte:head>

<div class="space-y-8 max-w-4xl mx-auto py-8 px-4">
	{#if loading && !docs}
		<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
	{:else if loadError}
		<p class="text-sm text-destructive">{loadError}</p>
	{:else if docs}
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">{m.docs_plugin_dev_title()}</h1>
		{#if docs.intro.bodyHtml}
			<div class="prose prose-sm dark:prose-invert max-w-none">
				{@html docs.intro.bodyHtml}
			</div>
		{:else}
			<p class="text-muted-foreground">{m.docs_plugin_dev_intro()}</p>
		{/if}
	</header>

	{#each sectionsAt('page_top', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	{#each sectionsAt('before_core', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	<div id="core">
		<Card>
			<CardHeader>
				<CardTitle class="text-base">{m.docs_section_core()}</CardTitle>
				<CardDescription>{m.docs_section_core_subtitle()}</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldTable fields={docs.coreFields} />
			</CardContent>
		</Card>
	</div>

	{#each sectionsAt('after_core', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	{#each sectionsAt('before_extensions', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	<div id="extensions">
		<Card>
			<CardHeader>
				<CardTitle class="text-base">{m.docs_section_extensions()}</CardTitle>
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

	{#each sectionsAt('after_extensions', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	{#each sectionsAt('before_kinds', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	<section class="space-y-4">
		<header class="space-y-1">
			<h2 id="kinds" class="text-xl font-semibold tracking-tight">{m.docs_section_kinds()}</h2>
			<p class="text-sm text-muted-foreground">{m.docs_section_kinds_subtitle()}</p>
		</header>
		{#if docs.kinds.length === 0}
			<p class="text-sm text-muted-foreground">{m.docs_no_kinds()}</p>
		{:else}
			{#each docs.kinds as kind (kind.key)}
				{#each sectionsAt({ kind: kind.key, slot: 'before' }, docs.customSections) as section (section.id)}
					<section class="space-y-2">
						{#if section.title}
							<h3 class="text-lg font-semibold tracking-tight">{section.title}</h3>
						{/if}
						<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
					</section>
				{/each}
				<div id={`kind-${kind.key}`}>
					<Card>
						<CardHeader>
							<CardTitle class="text-base">
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
								<div class="prose prose-sm dark:prose-invert max-w-none">
									{@html kind.prosePreHtml}
								</div>
							{/if}
							{#if kind.extensionFields.length > 0}
								<FieldTable fields={kind.extensionFields} />
							{/if}
							{#each docs.examples.perKind.filter((e) => e.kindKey === kind.key) as ex (ex.kindKey)}
								<CodeExample yaml={ex.yaml} json={ex.json} />
							{/each}
							{#if kind.prosePostHtml}
								<div class="prose prose-sm dark:prose-invert max-w-none">
									{@html kind.prosePostHtml}
								</div>
							{/if}
						</CardContent>
					</Card>
				</div>
				{#each sectionsAt({ kind: kind.key, slot: 'after' }, docs.customSections) as section (section.id)}
					<section class="space-y-2">
						{#if section.title}
							<h3 class="text-lg font-semibold tracking-tight">{section.title}</h3>
						{/if}
						<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
					</section>
				{/each}
			{/each}
		{/if}
	</section>

	{#each sectionsAt('after_kinds', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	{#each sectionsAt('before_api', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	<div id="api">
		<Card>
			<CardHeader>
				<CardTitle class="text-base">{m.docs_section_api()}</CardTitle>
			</CardHeader>
			<CardContent class="space-y-2">
				<p class="text-sm">{m.docs_api_reference_body()}</p>
				<div class="flex gap-3 text-sm">
					<a href={docs.apiReference.openapiUiUrl} class="text-primary hover:underline"> OpenAPI UI → </a>
					<a href={docs.apiReference.openapiSpecUrl} class="text-primary hover:underline"> openapi.json → </a>
				</div>
			</CardContent>
		</Card>
	</div>

	{#each sectionsAt('after_api', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}

	{#if docs.outro.bodyHtml}
		<div class="prose prose-sm dark:prose-invert max-w-none border-t border-border pt-6">
			{@html docs.outro.bodyHtml}
		</div>
	{/if}

	{#each sectionsAt('page_bottom', docs.customSections) as section (section.id)}
		<section class="space-y-2">
			{#if section.title}
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
			{/if}
			<div class="prose prose-sm dark:prose-invert max-w-none">{@html section.bodyHtml}</div>
		</section>
	{/each}
	{/if}
</div>
