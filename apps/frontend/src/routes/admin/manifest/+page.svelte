<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Eye from '@lucide/svelte/icons/eye'
	import EyeOff from '@lucide/svelte/icons/eye-off'
	import ChevronDown from '@lucide/svelte/icons/chevron-down'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import StickySaveBar from '$components/admin/StickySaveBar.svelte'
	import ExtensionsEditor, { type ExtensionsDelta } from '$components/admin/ExtensionsEditor.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	let loading = $state(true)
	let saving = $state(false)
	let extensions = $state<ExtensionsDelta>({})
	let initialSerialized = $state('')
	let mergedSchema = $state<Record<string, unknown>>({})
	let showPreview = $state(true)
	let showAllCore = $state(false)

	const CORE_DESC: Record<string, () => string> = {
		name: () => m.admin_manifest_core_desc_name(),
		description: () => m.admin_manifest_core_desc_description(),
		category: () => m.admin_manifest_core_desc_category(),
		kind: () => m.admin_manifest_core_desc_kind(),
		tags: () => m.admin_manifest_core_desc_tags(),
		license: () => m.admin_manifest_core_desc_license(),
		icon: () => m.admin_manifest_core_desc_icon(),
		screenshots: () => m.admin_manifest_core_desc_screenshots(),
		readme: () => m.admin_manifest_core_desc_readme(),
		documentation_url: () => m.admin_manifest_core_desc_documentation_url(),
		homepage: () => m.admin_manifest_core_desc_homepage(),
		support: () => m.admin_manifest_core_desc_support(),
		min_runtime_version: () => m.admin_manifest_core_desc_min_runtime_version(),
	}

	const coreFields = $derived.by(() => {
		const props = (mergedSchema.properties as Record<string, unknown>) ?? {}
		return Object.keys(props)
			.filter((k) => !(k in extensions))
			.map((name) => ({
				name,
				type: typeOf(props[name]),
				description: CORE_DESC[name]?.() ?? '',
			}))
	})

	const visibleCoreFields = $derived(showAllCore ? coreFields : coreFields.slice(0, 6))

	const isDirty = $derived(JSON.stringify(extensions) !== initialSerialized)

	const previewProps = $derived.by(() => {
		const props = (mergedSchema.properties as Record<string, unknown>) ?? {}
		const allProps = { ...props, ...extensions }
		return Object.keys(allProps).map((name) => ({
			name,
			isCore: !(name in extensions),
			node: allProps[name],
		}))
	})

	async function load() {
		try {
			const { data, error } = await eden.api.admin.manifest.extensions.get()
			if (error) throw new Error(extractError(error))
			const res = data as { extensions: ExtensionsDelta; mergedSchema: { properties?: Record<string, unknown> } }
			extensions = res.extensions
			mergedSchema = res.mergedSchema as Record<string, unknown>
			initialSerialized = JSON.stringify(extensions)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_manifest_ext_load_failed())
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function save() {
		saving = true
		try {
			const payload = Object.keys(extensions).length === 0 ? null : extensions
			const { error } = await eden.api.admin.manifest.extensions.put({ extensions: payload })
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_manifest_ext_saved())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_manifest_ext_save_failed())
		} finally {
			saving = false
		}
	}

	function discard() {
		load()
	}

	function typeOf(node: unknown): string {
		if (!node || typeof node !== 'object') return ''
		const n = node as Record<string, unknown>
		if (typeof n.type === 'string') return n.type
		if (Array.isArray(n.type)) return n.type.join('|')
		return 'object'
	}

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			if (isDirty) save()
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<AdminPageHeader title={m.admin_manifest_page_title()} subtitle={m.admin_manifest_page_subtitle()} />

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] {showPreview ? '' : 'lg:grid-cols-[minmax(0,1fr)]'}">
	<div class="space-y-6 min-w-0">
		<Card>
			<CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0">
				<div class="space-y-1">
					<CardTitle class="text-base">{m.admin_manifest_core_card_title()}</CardTitle>
					<CardDescription>{m.admin_manifest_core_card_subtitle()}</CardDescription>
				</div>
				<button
					type="button"
					class="hidden lg:inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
					onclick={() => (showPreview = !showPreview)}
					aria-label={showPreview ? m.admin_manifest_preview_hide() : m.admin_manifest_preview_show()}
				>
					{#if showPreview}
						<EyeOff class="h-3 w-3" />
						{m.admin_manifest_preview_hide()}
					{:else}
						<Eye class="h-3 w-3" />
						{m.admin_manifest_preview_show()}
					{/if}
				</button>
			</CardHeader>
			<CardContent class="space-y-2">
				{#if loading}
					<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
				{:else}
					<ul class="rounded-md border border-border/60 bg-card/30 divide-y divide-border/40">
						{#each visibleCoreFields as field (field.name)}
							<li class="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2 items-baseline">
								<code class="font-mono text-xs">{field.name}</code>
								<span class="text-[11px] text-muted-foreground">{field.description}</span>
								<span class="font-mono text-[10px] text-muted-foreground tabular-nums">{field.type}</span>
							</li>
						{/each}
					</ul>
					{#if coreFields.length > 6}
						<button
							type="button"
							class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
							onclick={() => (showAllCore = !showAllCore)}
						>
							{#if showAllCore}
								<ChevronDown class="h-3 w-3" />
								{m.admin_manifest_core_show_less()}
							{:else}
								<ChevronRight class="h-3 w-3" />
								{m.admin_manifest_core_show_all()}
								<span class="text-muted-foreground/60">({coreFields.length - 6})</span>
							{/if}
						</button>
					{/if}
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<div class="space-y-1">
					<CardTitle class="text-base">{m.admin_manifest_ext_card_title()}</CardTitle>
					<CardDescription>{m.admin_manifest_ext_card_subtitle()}</CardDescription>
				</div>
			</CardHeader>
			<CardContent>
				{#if loading}
					<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
				{:else}
					<ExtensionsEditor bind:value={extensions} />
				{/if}
			</CardContent>
		</Card>
	</div>

	{#if showPreview}
		<aside class="space-y-3 lg:sticky lg:top-24 lg:self-start">
			<div class="flex items-center justify-between">
				<div class="space-y-0.5">
					<h2 class="text-sm font-semibold tracking-tight">{m.admin_manifest_preview_title()}</h2>
					<p class="text-xs text-muted-foreground">{m.admin_manifest_preview_subtitle()}</p>
				</div>
				<button
					type="button"
					class="lg:hidden inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 text-xs text-muted-foreground hover:text-foreground"
					onclick={() => (showPreview = false)}
				>
					<EyeOff class="h-3 w-3" />
				</button>
			</div>
			<div class="rounded-lg border border-border bg-card/40 max-h-[36rem] overflow-y-auto">
				{#if loading}
					<p class="p-4 text-sm text-muted-foreground">{m.common_loading()}</p>
				{:else}
					<ul class="divide-y divide-border/60">
						{#each previewProps as p (p.name)}
							<li class="px-3 py-2 flex items-center gap-2 text-xs">
								{#if !p.isCore}
									<span class="h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-hidden="true"></span>
								{:else}
									<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" aria-hidden="true"></span>
								{/if}
								<code class="font-mono shrink-0">{p.name}</code>
								<span class="text-muted-foreground ml-auto font-mono text-[10px]">{typeOf(p.node)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="text-[11px] text-muted-foreground space-y-1">
				<p class="flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true"></span>
					{m.admin_manifest_preview_legend_core()}
				</p>
				<p class="flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true"></span>
					{m.admin_manifest_preview_legend_ext()}
				</p>
			</div>
			<div class="rounded-md border border-dashed border-border bg-card/30 p-3 space-y-1 text-[11px] text-muted-foreground">
				<p class="font-medium text-foreground">{m.admin_manifest_preview_url_label()}</p>
				<code class="block font-mono break-all">/manifest.schema.json</code>
				<p>{m.admin_manifest_preview_url_hint()}</p>
			</div>
		</aside>
	{/if}
</div>

<StickySaveBar dirty={isDirty} {saving} onSave={save} onDiscard={discard} />
