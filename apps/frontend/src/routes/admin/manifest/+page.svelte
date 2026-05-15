<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Code from '@lucide/svelte/icons/code'
	import LayoutList from '@lucide/svelte/icons/layout-list'
	import ChevronDown from '@lucide/svelte/icons/chevron-down'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import FileJson from '@lucide/svelte/icons/file-json'
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import Eye from '@lucide/svelte/icons/eye'
	import EyeOff from '@lucide/svelte/icons/eye-off'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import JsonEditor from '$components/JsonEditor.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	type SchemaNode = Record<string, unknown>
	type ExtensionsDelta = Record<string, SchemaNode>

	type FormProperty = {
		name: string
		type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
		description: string
		isAdvanced: boolean
		advancedJson: string
		stringEnum: string
		stringPattern: string
		arrayItemType: 'string' | 'number' | 'integer' | 'boolean'
		expanded: boolean
	}

	type Mode = 'form' | 'json'

	let loading = $state(true)
	let saving = $state(false)
	let mode = $state<Mode>('form')
	let formProps = $state<FormProperty[]>([])
	let advancedJson = $state('')
	let advancedJsonError = $state<string | null>(null)
	let coreProperties = $state<string[]>([])
	let initialSerialized = $state('')
	let showPreview = $state(true)
	let mergedSchema = $state<Record<string, unknown>>({})

	function emptyProperty(expanded = true): FormProperty {
		return {
			name: '',
			type: 'string',
			description: '',
			isAdvanced: false,
			advancedJson: '',
			stringEnum: '',
			stringPattern: '',
			arrayItemType: 'string',
			expanded,
		}
	}

	function isSimpleArray(node: SchemaNode): boolean {
		const items = node.items as SchemaNode | undefined
		if (!items || typeof items.type !== 'string') return false
		return ['string', 'number', 'integer', 'boolean'].includes(items.type)
	}

	function nodeToForm(name: string, node: SchemaNode): FormProperty {
		const t = node.type as FormProperty['type'] | undefined
		const isSimple = (
			t === 'string' ||
			t === 'number' ||
			t === 'integer' ||
			t === 'boolean' ||
			(t === 'array' && isSimpleArray(node)) ||
			(t === 'object' && Object.keys(node.properties ?? {}).length === 0)
		)
		const fp = emptyProperty(false)
		fp.name = name
		fp.type = t && ['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(t)
			? (t as FormProperty['type'])
			: 'string'
		fp.description = typeof node.description === 'string' ? node.description : ''
		if (t === 'string' && Array.isArray(node.enum)) {
			fp.stringEnum = (node.enum as string[]).join(', ')
		}
		if (t === 'string' && typeof node.pattern === 'string') {
			fp.stringPattern = node.pattern
		}
		if (t === 'array' && node.items && typeof (node.items as SchemaNode).type === 'string') {
			fp.arrayItemType = ((node.items as SchemaNode).type as FormProperty['arrayItemType']) ?? 'string'
		}
		if (!isSimple) {
			fp.isAdvanced = true
			fp.advancedJson = JSON.stringify(node, null, 2)
		}
		return fp
	}

	function formToNode(fp: FormProperty): SchemaNode {
		if (fp.isAdvanced) {
			const text = (fp.advancedJson ?? '').trim()
			if (!text) return { type: fp.type }
			return JSON.parse(text)
		}
		const out: SchemaNode = { type: fp.type }
		if (fp.description.trim()) out.description = fp.description.trim()
		if (fp.type === 'string') {
			const enumValues = fp.stringEnum
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0)
			if (enumValues.length > 0) out.enum = enumValues
			if (fp.stringPattern.trim()) out.pattern = fp.stringPattern.trim()
		}
		if (fp.type === 'array') {
			out.items = { type: fp.arrayItemType }
		}
		return out
	}

	function deltaFromForm(): ExtensionsDelta {
		const out: ExtensionsDelta = {}
		for (const fp of formProps) {
			if (!fp.name.trim()) continue
			try {
				out[fp.name.trim()] = formToNode(fp)
			} catch {
				// skip invalid advanced JSON; surfaced by save
			}
		}
		return out
	}

	const currentDelta = $derived.by(() => {
		if (mode === 'form') return deltaFromForm()
		try {
			return JSON.parse(advancedJson || '{}') as ExtensionsDelta
		} catch {
			return {} as ExtensionsDelta
		}
	})

	const isDirty = $derived(JSON.stringify(currentDelta) !== initialSerialized)

	const previewProps = $derived.by(() => {
		const props = (mergedSchema.properties as Record<string, unknown>) ?? {}
		return Object.keys(props).map((name) => ({
			name,
			isCore: !(name in (currentDelta as Record<string, unknown>)),
			node: props[name],
		}))
	})

	async function load() {
		try {
			const { data, error } = await eden.api.admin.manifest.extensions.get()
			if (error) throw new Error(extractError(error))
			const res = data as { extensions: ExtensionsDelta; mergedSchema: { properties?: Record<string, unknown> } }
			coreProperties = Object.keys(res.mergedSchema.properties ?? {}).filter(
				(k) => !(k in res.extensions),
			)
			mergedSchema = res.mergedSchema as Record<string, unknown>
			const entries = Object.entries(res.extensions)
			formProps = entries.map(([n, node]) => {
				const fp = nodeToForm(n, node)
				fp.expanded = entries.length <= 2
				return fp
			})
			advancedJson = entries.length > 0 ? JSON.stringify(res.extensions, null, 2) : ''
			initialSerialized = JSON.stringify(res.extensions)
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
			let extensions: ExtensionsDelta | null = null
			if (mode === 'form') {
				try {
					extensions = deltaFromForm()
				} catch (e) {
					toast.error(e instanceof Error ? `JSON parse: ${e.message}` : 'invalid JSON in an advanced property')
					return
				}
			} else {
				try {
					const parsed = advancedJson.trim() ? JSON.parse(advancedJson) : {}
					if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
						throw new Error('Root must be a JSON object')
					}
					extensions = parsed as ExtensionsDelta
				} catch (e) {
					advancedJsonError = e instanceof Error ? e.message : 'invalid JSON'
					toast.error(advancedJsonError)
					return
				}
			}
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

	function addProperty() {
		formProps = [...formProps.map((p) => ({ ...p, expanded: false })), emptyProperty(true)]
	}

	function removeProperty(idx: number) {
		formProps = formProps.filter((_, i) => i !== idx)
	}

	function syncAdvanced() {
		try {
			advancedJson = JSON.stringify(deltaFromForm(), null, 2)
			advancedJsonError = null
		} catch (e) {
			advancedJsonError = e instanceof Error ? e.message : 'invalid'
		}
	}

	function switchMode(next: Mode) {
		if (next === 'json' && mode === 'form') {
			syncAdvanced()
		}
		if (next === 'form' && mode === 'json') {
			try {
				const parsed = advancedJson.trim() ? JSON.parse(advancedJson) : {}
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
					formProps = Object.entries(parsed as ExtensionsDelta).map(([n, node], i, arr) => {
						const fp = nodeToForm(n, node)
						fp.expanded = arr.length <= 2
						return fp
					})
					advancedJsonError = null
				}
			} catch (e) {
				advancedJsonError = e instanceof Error ? e.message : 'invalid'
				toast.error(m.admin_manifest_ext_json_invalid())
				return
			}
		}
		mode = next
	}

	function loadTemplate(template: 'wrapped' | 'x-prefixed') {
		const next: FormProperty[] = []
		if (template === 'wrapped') {
			const fp = emptyProperty(true)
			fp.name = 'x-yourapp'
			fp.type = 'object'
			fp.description = 'App-specific configuration for your registry consumers.'
			fp.isAdvanced = true
			fp.advancedJson = JSON.stringify(
				{
					type: 'object',
					properties: {
						mode: { type: 'string', enum: ['light', 'dark'] },
						widgets: { type: 'array', items: { type: 'string' } },
					},
				},
				null,
				2,
			)
			next.push(fp)
		} else {
			const a = emptyProperty(true)
			a.name = 'x-api-version'
			a.type = 'string'
			a.description = 'Required API version of your host app.'
			a.stringPattern = '^\\d+\\.\\d+$'
			const b = emptyProperty(true)
			b.name = 'x-permissions'
			b.type = 'array'
			b.description = 'Permissions the plugin needs from the host app.'
			b.arrayItemType = 'string'
			next.push(a, b)
		}
		formProps = next
		mode = 'form'
	}

	function summary(fp: FormProperty): string {
		if (fp.isAdvanced) return 'custom JSON Schema'
		const parts: string[] = []
		if (fp.type === 'string' && fp.stringEnum.trim()) {
			parts.push(`one of: ${fp.stringEnum}`)
		} else if (fp.type === 'array') {
			parts.push(`${fp.arrayItemType}[]`)
		} else {
			parts.push(fp.type)
		}
		if (fp.description.trim()) parts.push(fp.description.trim())
		return parts.join(' · ')
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
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_manifest_page_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_manifest_page_subtitle()}</p>
</header>

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
					<div class="flex flex-wrap gap-1.5">
						{#each coreProperties as prop (prop)}
							<Badge variant="secondary" class="font-mono text-[11px]">{prop}</Badge>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="space-y-3">
				<div class="flex items-start justify-between gap-3">
					<div class="space-y-1">
						<CardTitle class="text-base">{m.admin_manifest_ext_card_title()}</CardTitle>
						<CardDescription>{m.admin_manifest_ext_card_subtitle()}</CardDescription>
					</div>
					<div class="inline-flex rounded-md border border-border bg-card/50 p-0.5 text-xs shrink-0">
						<button
							type="button"
							class="px-2.5 py-1 rounded inline-flex items-center gap-1.5 transition-colors {mode === 'form' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}"
							onclick={() => switchMode('form')}
						>
							<LayoutList class="h-3 w-3" />
							{m.admin_manifest_ext_form_mode()}
						</button>
						<button
							type="button"
							class="px-2.5 py-1 rounded inline-flex items-center gap-1.5 transition-colors {mode === 'json' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}"
							onclick={() => switchMode('json')}
						>
							<Code class="h-3 w-3" />
							{m.admin_manifest_ext_json_mode()}
						</button>
					</div>
				</div>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if loading}
					<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
				{:else if mode === 'form'}
					{#if formProps.length === 0}
						<div class="rounded-lg border border-dashed border-border bg-card/30 p-8 text-center space-y-4">
							<div class="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
								<Sparkles class="h-5 w-5" />
							</div>
							<div class="space-y-1">
								<p class="text-sm font-medium">{m.admin_manifest_ext_empty_title()}</p>
								<p class="text-xs text-muted-foreground max-w-md mx-auto">{m.admin_manifest_ext_empty_body()}</p>
							</div>
							<div class="flex flex-wrap justify-center gap-2">
								<Button size="sm" onclick={addProperty}>
									<Plus class="h-3.5 w-3.5" />
									{m.admin_manifest_ext_empty_blank()}
								</Button>
								<Button size="sm" variant="outline" onclick={() => switchMode('json')}>
									<FileJson class="h-3.5 w-3.5" />
									{m.admin_manifest_ext_empty_paste()}
								</Button>
							</div>
							<div class="pt-3 border-t border-border/40 space-y-2">
								<p class="text-[11px] uppercase tracking-wider text-muted-foreground">{m.admin_manifest_ext_empty_templates()}</p>
								<div class="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
									<button type="button" class="rounded-md border border-border bg-card/50 hover:bg-accent/40 hover:border-primary/40 transition-all px-3 py-2.5 text-left space-y-1" onclick={() => loadTemplate('wrapped')}>
										<div class="text-xs font-medium">{m.admin_manifest_ext_template_wrapped()}</div>
										<code class="block text-[10px] text-muted-foreground font-mono">x-yourapp: &lbrace; mode, widgets &rbrace;</code>
									</button>
									<button type="button" class="rounded-md border border-border bg-card/50 hover:bg-accent/40 hover:border-primary/40 transition-all px-3 py-2.5 text-left space-y-1" onclick={() => loadTemplate('x-prefixed')}>
										<div class="text-xs font-medium">{m.admin_manifest_ext_template_xprefixed()}</div>
										<code class="block text-[10px] text-muted-foreground font-mono">x-api-version, x-permissions</code>
									</button>
								</div>
							</div>
						</div>
					{:else}
						{#each formProps as fp, idx (idx)}
							<div class="rounded-md border border-border bg-card/30 overflow-hidden transition-colors hover:border-border/80">
								<div class="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
									<button
										type="button"
										class="flex items-center gap-2 flex-1 min-w-0 text-left"
										onclick={() => (fp.expanded = !fp.expanded)}
									>
										{#if fp.expanded}
											<ChevronDown class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
										{:else}
											<ChevronRight class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
										{/if}
										<code class="font-mono text-sm shrink-0">
											{fp.name || m.admin_manifest_ext_unnamed()}
										</code>
										<span class="text-xs text-muted-foreground truncate flex-1 min-w-0">
											{summary(fp)}
										</span>
									</button>
									<button
										type="button"
										class="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
										onclick={() => removeProperty(idx)}
										aria-label={m.common_remove()}
										title={m.common_remove()}
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								</div>
								{#if fp.expanded}
									<div class="p-3 pt-3 space-y-3 border-t border-border/60 bg-card/50">
										<div class="grid gap-2 sm:grid-cols-[1fr_10rem]">
											<div class="grid gap-1">
												<Label class="text-xs">{m.admin_manifest_ext_field_name()}</Label>
												<Input bind:value={fp.name} placeholder="x-tabularis" maxlength={60} />
											</div>
											<div class="grid gap-1">
												<Label class="text-xs">{m.admin_manifest_ext_field_type()}</Label>
												<select
													bind:value={fp.type}
													disabled={fp.isAdvanced}
													class="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
												>
													<option value="string">string</option>
													<option value="number">number</option>
													<option value="integer">integer</option>
													<option value="boolean">boolean</option>
													<option value="array">array</option>
													<option value="object">object</option>
												</select>
											</div>
										</div>

										{#if !fp.isAdvanced}
											<div class="grid gap-1">
												<Label class="text-xs">{m.admin_manifest_ext_field_description()}</Label>
												<Input bind:value={fp.description} maxlength={200} placeholder={m.admin_manifest_ext_description_placeholder()} />
											</div>

											{#if fp.type === 'string'}
												<div class="grid sm:grid-cols-2 gap-2">
													<div class="grid gap-1">
														<Label class="text-xs">{m.admin_manifest_ext_string_enum()}</Label>
														<Input bind:value={fp.stringEnum} placeholder="light, dark, system" />
													</div>
													<div class="grid gap-1">
														<Label class="text-xs">{m.admin_manifest_ext_string_pattern()}</Label>
														<Input bind:value={fp.stringPattern} placeholder="^[a-z]+$" />
													</div>
												</div>
											{:else if fp.type === 'array'}
												<div class="grid gap-1 max-w-xs">
													<Label class="text-xs">{m.admin_manifest_ext_array_item_type()}</Label>
													<select
														bind:value={fp.arrayItemType}
														class="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
													>
														<option value="string">string</option>
														<option value="number">number</option>
														<option value="integer">integer</option>
														<option value="boolean">boolean</option>
													</select>
												</div>
											{/if}

											<button
												type="button"
												class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
												onclick={() => {
													const snapshot = formToNode(fp)
													fp.advancedJson = JSON.stringify(snapshot, null, 2)
													fp.isAdvanced = true
												}}
											>
												<Code class="h-3 w-3" />
												{m.admin_manifest_ext_advanced_toggle()}
											</button>
										{:else}
											<div class="grid gap-1">
												<Label class="text-xs">{m.admin_manifest_ext_advanced_json_label()}</Label>
												<JsonEditor bind:value={fp.advancedJson} minHeight="10rem" />
												<button
													type="button"
													class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors self-start"
													onclick={() => {
														try {
															const node = JSON.parse(fp.advancedJson) as SchemaNode
															fp.isAdvanced = false
															fp.type = (node.type as FormProperty['type']) ?? 'string'
														} catch {
															toast.error(m.admin_manifest_ext_json_invalid())
														}
													}}
												>
													<LayoutList class="h-3 w-3" />
													{m.admin_manifest_ext_advanced_back_to_form()}
												</button>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}

						<Button variant="outline" size="sm" onclick={addProperty}>
							<Plus class="h-3.5 w-3.5" />
							{m.admin_manifest_ext_add_property()}
						</Button>
					{/if}
				{:else}
					<div class="space-y-2">
						<JsonEditor
							bind:value={advancedJson}
							minHeight="22rem"
							onchange={(_, err) => (advancedJsonError = err)}
						/>
						{#if advancedJsonError}
							<p class="text-xs text-destructive">{advancedJsonError}</p>
						{/if}
						<p class="text-xs text-muted-foreground">{m.admin_manifest_ext_json_hint()}</p>
					</div>
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

<div
	class="sticky bottom-0 -mx-6 px-6 py-3 mt-6 bg-background/95 backdrop-blur-md border-t border-border z-20 flex items-center justify-between gap-3 transition-opacity {isDirty || saving ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
>
	<span class="text-xs text-muted-foreground inline-flex items-center gap-2">
		<span class="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" aria-hidden="true"></span>
		{m.admin_manifest_unsaved_changes()}
	</span>
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="sm" onclick={discard} disabled={saving}>
			<RotateCcw class="h-3.5 w-3.5" />
			{m.admin_manifest_discard()}
		</Button>
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? m.common_saving() : m.common_save()}
		</Button>
	</div>
</div>
