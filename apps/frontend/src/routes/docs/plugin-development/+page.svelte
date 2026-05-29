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
	import FileText from '@lucide/svelte/icons/file-text'
	import Copy from '@lucide/svelte/icons/copy'
	import Check from '@lucide/svelte/icons/check'

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
		| 'before_kinds'
		| 'after_kinds'
		| 'page_bottom'
		| { kind: string; slot: 'before' | 'after' }

	type DocHeading = { level: 2 | 3; id: string; text: string }

	type CustomSection = {
		id: string
		title: string | null
		bodyHtml: string
		headings: DocHeading[]
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
		page: { title: string | null; excerpt: string | null }
		intro: { bodyHtml: string | null; headings: DocHeading[] }
		outro: { bodyHtml: string | null; headings: DocHeading[] }
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

	const topPositions: PositionMarker[] = ['page_top', 'before_kinds']
	const bottomPositions: PositionMarker[] = ['after_kinds', 'page_bottom']

	let copied = $state(false)
	async function copyMarkdown() {
		try {
			const res = await fetch('/api/docs/plugin-development?format=md')
			const md = await res.text()
			await navigator.clipboard.writeText(md)
			copied = true
			setTimeout(() => (copied = false), 1500)
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Copy failed'
		}
	}
</script>

<svelte:head>
	<title>{docs?.page.title ?? m.docs_plugin_dev_title()}</title>
</svelte:head>

<div class="max-w-6xl mx-auto py-8 px-4">
	{#if loading && !docs}
		<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
	{:else if loadError}
		<p class="text-sm text-destructive">{loadError}</p>
	{:else if docs}
		<div class="lg:grid lg:grid-cols-[1fr_220px] lg:gap-8">
			<main class="space-y-10 min-w-0">
				<header id="intro" class="space-y-4 scroll-mt-20">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<h1 class="text-4xl font-semibold tracking-tight">{docs.page.title ?? m.docs_plugin_dev_title()}</h1>
						<div class="flex flex-wrap gap-2 shrink-0">
							<a
								href="/api/docs/plugin-development?format=md"
								target="_blank"
								rel="noopener"
								class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-accent hover:text-accent-foreground px-3 h-8 text-xs font-medium transition-colors"
								title={m.docs_llm_hint()}
							>
								<FileText class="h-3.5 w-3.5" />
								{m.docs_toc_llm()}
							</a>
							<button
								type="button"
								class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-accent hover:text-accent-foreground px-3 h-8 text-xs font-medium transition-colors cursor-pointer"
								onclick={copyMarkdown}
							>
								{#if copied}
									<Check class="h-3.5 w-3.5 text-emerald-500" />
									{m.docs_llm_copied()}
								{:else}
									<Copy class="h-3.5 w-3.5" />
									{m.docs_llm_copy()}
								{/if}
							</button>
						</div>
					</div>
					{#if docs.page.excerpt}
						<p class="text-lg text-muted-foreground">{docs.page.excerpt}</p>
					{/if}
					{#if docs.intro.bodyHtml}
						<div class="prose dark:prose-invert max-w-none">{@html docs.intro.bodyHtml}</div>
					{:else if !docs.page.excerpt}
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
				<div class="sticky top-20 flex flex-col gap-4 text-sm max-h-[calc(100vh-6rem)]">
					<div class="space-y-0.5 shrink-0">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2 font-semibold">
							{m.docs_toc_reference()}
						</p>
						<a
							href="/docs/plugin-development/schema"
							class="block py-1 text-muted-foreground hover:text-foreground transition-colors"
						>
							{m.docs_schema_link_label()}
						</a>
						<a
							href="/api/docs/plugin-development?format=md"
							target="_blank"
							rel="noopener"
							class="block py-1 text-muted-foreground hover:text-foreground transition-colors"
						>
							{m.docs_toc_llm()} ↗
						</a>
					</div>
					<nav class="space-y-0.5 overflow-y-auto pr-2 min-h-0 -mr-2">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2 font-semibold">
							{m.docs_toc()}
						</p>
						<a href="#intro" class="block py-1 text-muted-foreground hover:text-foreground transition-colors">
							{m.docs_toc_intro()}
						</a>
						{#each docs.intro.headings as h (h.id)}
							<a
								href={`#${h.id}`}
								class={[
									'block py-1 text-muted-foreground hover:text-foreground transition-colors',
									h.level === 3 ? 'pl-5 text-xs' : 'pl-3',
								].join(' ')}
							>
								{h.text}
							</a>
						{/each}
						{#each docs.customSections as section (section.id)}
							{#if section.title}
								<a
									href={`#section-${section.id}`}
									class="block py-1 text-muted-foreground hover:text-foreground transition-colors"
								>
									{section.title}
								</a>
								{#each section.headings as h (h.id)}
									<a
										href={`#${h.id}`}
										class={[
											'block py-1 text-muted-foreground hover:text-foreground transition-colors',
											h.level === 3 ? 'pl-5 text-xs' : 'pl-3',
										].join(' ')}
									>
										{h.text}
									</a>
								{/each}
							{/if}
						{/each}
						{#if docs.kinds.length > 0}
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-5 mb-2 font-semibold">
								{m.docs_toc_kinds()}
							</p>
							<a href="#kinds" class="block py-1 text-muted-foreground hover:text-foreground transition-colors">
								{m.docs_section_kinds()}
							</a>
							{#each docs.kinds as kind (kind.key)}
								<a
									href={`#kind-${kind.key}`}
									class="block py-1 pl-3 text-muted-foreground hover:text-foreground transition-colors"
								>
									{kind.label}
								</a>
							{/each}
						{/if}
					</nav>
				</div>
			</aside>
		</div>
	{/if}
</div>

<style>
	main :global(.prose) {
		--tw-prose-body: hsl(var(--foreground));
		--tw-prose-headings: hsl(var(--foreground));
		--tw-prose-links: hsl(var(--primary));
		--tw-prose-bold: hsl(var(--foreground));
		--tw-prose-bullets: hsl(var(--primary) / 0.7);
		--tw-prose-counters: hsl(var(--primary));
	}
	main :global(.prose h2),
	main :global(.prose h3),
	main :global(.prose h4) {
		scroll-margin-top: 5rem;
	}
	main :global(.prose h2) {
		padding-bottom: 0.35em;
		border-bottom: 1px solid hsl(var(--border));
		margin-top: 2.5em;
	}
	main :global(.prose h3) {
		margin-top: 1.75em;
	}
	main :global(.prose :not(pre) > code) {
		font-size: 0.85em;
		padding: 0.12em 0.4em;
		border-radius: 4px;
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
		font-weight: 500;
		border: 1px solid hsl(var(--border));
	}
	main :global(.prose :not(pre) > code::before),
	main :global(.prose :not(pre) > code::after) {
		content: '';
	}
	main :global(.prose pre) {
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		padding: 0;
		overflow: hidden;
		background: transparent;
	}
	main :global(.prose pre > code),
	main :global(.prose pre.shiki) {
		display: block;
		padding: 1rem 1.1rem;
		font-size: 0.85rem;
		line-height: 1.65;
		background: hsl(var(--muted) / 0.4);
	}
	main :global(.prose .shiki) {
		background: hsl(var(--muted) / 0.4) !important;
	}
	main :global(.prose ol) {
		padding-left: 1.25em;
	}
	main :global(.prose ol > li::marker) {
		color: hsl(var(--primary));
		font-weight: 600;
	}
	main :global(.prose ul > li::marker) {
		color: hsl(var(--primary) / 0.7);
	}
	:global(.dark) main :global(.shiki),
	:global(.dark) main :global(.shiki span) {
		color: var(--shiki-dark) !important;
		background-color: var(--shiki-dark-bg) !important;
		font-style: var(--shiki-dark-font-style) !important;
		font-weight: var(--shiki-dark-font-weight) !important;
		text-decoration: var(--shiki-dark-text-decoration) !important;
	}
</style>
