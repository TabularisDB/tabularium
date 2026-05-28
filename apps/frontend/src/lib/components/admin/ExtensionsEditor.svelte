<script lang="ts" module>
	export type SchemaNode = Record<string, unknown>
	export type ExtensionsDelta = Record<string, SchemaNode>
</script>

<script lang="ts">
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Code from '@lucide/svelte/icons/code'
	import LayoutList from '@lucide/svelte/icons/layout-list'
	import FileJson from '@lucide/svelte/icons/file-json'
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import JsonEditor from '$components/JsonEditor.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import EmptyState from '$components/admin/EmptyState.svelte'
	import CollapsibleRow from '$components/admin/CollapsibleRow.svelte'
	import TabBar from '$components/admin/TabBar.svelte'
	import { m } from '$lib/paraglide/messages'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { cn } from '$lib/utils'

	type Props = {
		value: ExtensionsDelta
		templates?: boolean
		minHeight?: string
		class?: string
	}

	let {
		value = $bindable<ExtensionsDelta>({}),
		templates: showTemplates = true,
		minHeight = '22rem',
		class: className,
	}: Props = $props()

	type FormProperty = {
		name: string
		type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
		description: string
		descriptionTranslations: Record<string, string>
		isAdvanced: boolean
		advancedJson: string
		stringEnum: string
		stringPattern: string
		arrayItemType: 'string' | 'number' | 'integer' | 'boolean'
		expanded: boolean
	}

	type Mode = 'form' | 'json'

	let mode = $state<Mode>('form')
	let formProps = $state<FormProperty[]>([])
	let advancedJson = $state('')
	let advancedJsonError = $state<string | null>(null)
	let lastSerialized = $state('__uninitialized__')

	function emptyProperty(expanded = true): FormProperty {
		return {
			name: '',
			type: 'string',
			description: '',
			descriptionTranslations: {},
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
		const isSimple =
			t === 'string' ||
			t === 'number' ||
			t === 'integer' ||
			t === 'boolean' ||
			(t === 'array' && isSimpleArray(node)) ||
			(t === 'object' && Object.keys(node.properties ?? {}).length === 0)
		const fp = emptyProperty(false)
		fp.name = name
		fp.type =
			t && ['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(t)
				? (t as FormProperty['type'])
				: 'string'
		fp.description = typeof node.description === 'string' ? node.description : ''
		const xTrans = node['x-translations']
		if (xTrans && typeof xTrans === 'object' && !Array.isArray(xTrans)) {
			const map: Record<string, string> = {}
			for (const [k, v] of Object.entries(xTrans as Record<string, unknown>)) {
				if (typeof v === 'string') map[k] = v
			}
			fp.descriptionTranslations = map
		}
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
		const transEntries = Object.entries(fp.descriptionTranslations).filter(
			([, v]) => typeof v === 'string' && v.trim() !== '',
		)
		if (transEntries.length > 0) {
			out['x-translations'] = Object.fromEntries(transEntries)
		}
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
				/* skip invalid advanced JSON; surfaced on commit */
			}
		}
		return out
	}

	function syncFromValue(next: ExtensionsDelta) {
		const entries = Object.entries(next ?? {})
		formProps = entries.map(([n, node]) => {
			const fp = nodeToForm(n, node)
			fp.expanded = entries.length <= 2
			return fp
		})
		advancedJson = entries.length > 0 ? JSON.stringify(next, null, 2) : ''
	}

	function commit() {
		let next: ExtensionsDelta = {}
		if (mode === 'form') {
			next = deltaFromForm()
		} else {
			const text = advancedJson.trim()
			if (!text) {
				next = {}
			} else {
				try {
					const parsed = JSON.parse(text)
					if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
						advancedJsonError = 'Root must be a JSON object'
						return
					}
					advancedJsonError = null
					next = parsed as ExtensionsDelta
				} catch (e) {
					advancedJsonError = e instanceof Error ? e.message : 'invalid JSON'
					return
				}
			}
		}
		const serialized = JSON.stringify(next)
		if (serialized === lastSerialized) return
		lastSerialized = serialized
		value = next
	}

	$effect(() => {
		const incoming = JSON.stringify(value ?? {})
		if (incoming === lastSerialized) return
		lastSerialized = incoming
		syncFromValue(value ?? {})
	})

	function addProperty() {
		formProps = [...formProps.map((p) => ({ ...p, expanded: false })), emptyProperty(true)]
	}

	function removeProperty(idx: number) {
		formProps = formProps.filter((_, i) => i !== idx)
		commit()
	}

	function updateTranslation(idx: number, locale: Locale, next: string) {
		const fp = formProps[idx]
		if (!fp) return
		const map = { ...fp.descriptionTranslations }
		if (next.trim() === '') {
			delete map[locale]
		} else {
			map[locale] = next
		}
		fp.descriptionTranslations = map
		commit()
	}

	function switchMode(next: Mode) {
		if (next === 'json' && mode === 'form') {
			advancedJson = JSON.stringify(deltaFromForm(), null, 2)
			advancedJsonError = null
		}
		if (next === 'form' && mode === 'json') {
			try {
				const parsed = advancedJson.trim() ? JSON.parse(advancedJson) : {}
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
					const entries = Object.entries(parsed as ExtensionsDelta)
					formProps = entries.map(([n, node], _i, arr) => {
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
		commit()
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

	function onJsonChange(next: string, err: string | null) {
		advancedJson = next
		advancedJsonError = err
		if (!err) commit()
	}
</script>

<div class={cn('space-y-3', className)}>
	<div class="flex items-center justify-end">
		<TabBar
			size="sm"
			bind:active={mode}
			onChange={switchMode}
			tabs={[
				{ id: 'form', label: m.admin_manifest_ext_form_mode(), icon: LayoutList },
				{ id: 'json', label: m.admin_manifest_ext_json_mode(), icon: Code },
			]}
		/>
	</div>

	{#snippet templatesContent()}
		<button
			type="button"
			class="rounded-md border border-border bg-card/50 hover:bg-accent/40 hover:border-primary/40 transition-all px-3 py-2.5 text-left space-y-1"
			onclick={() => loadTemplate('wrapped')}
		>
			<div class="text-xs font-medium">{m.admin_manifest_ext_template_wrapped()}</div>
			<code class="block text-[10px] text-muted-foreground font-mono">x-yourapp: &lbrace; mode, widgets &rbrace;</code>
		</button>
		<button
			type="button"
			class="rounded-md border border-border bg-card/50 hover:bg-accent/40 hover:border-primary/40 transition-all px-3 py-2.5 text-left space-y-1"
			onclick={() => loadTemplate('x-prefixed')}
		>
			<div class="text-xs font-medium">{m.admin_manifest_ext_template_xprefixed()}</div>
			<code class="block text-[10px] text-muted-foreground font-mono">x-api-version, x-permissions</code>
		</button>
	{/snippet}

	{#if mode === 'form'}
		{#if formProps.length === 0}
			<EmptyState
				icon={Sparkles}
				title={m.admin_manifest_ext_empty_title()}
				body={m.admin_manifest_ext_empty_body()}
				templatesLabel={showTemplates ? m.admin_manifest_ext_empty_templates() : undefined}
				templates={showTemplates ? templatesContent : undefined}
			>
				{#snippet actions()}
					<Button
						size="sm"
						onclick={() => {
							addProperty()
							commit()
						}}
					>
						<Plus class="h-3.5 w-3.5" />
						{m.admin_manifest_ext_empty_blank()}
					</Button>
					<Button size="sm" variant="outline" onclick={() => switchMode('json')}>
						<FileJson class="h-3.5 w-3.5" />
						{m.admin_manifest_ext_empty_paste()}
					</Button>
				{/snippet}
			</EmptyState>
		{:else}
			{#each formProps as fp, idx (idx)}
				<CollapsibleRow
					bind:expanded={fp.expanded}
					name={fp.name || m.admin_manifest_ext_unnamed()}
					summary={summary(fp)}
					onRemove={() => removeProperty(idx)}
					removeLabel={m.common_remove()}
				>
					{#snippet header()}
						<code class="font-mono text-sm shrink-0">
							{fp.name || m.admin_manifest_ext_unnamed()}
						</code>
						<span class="text-xs text-muted-foreground truncate flex-1 min-w-0">
							{summary(fp)}
						</span>
					{/snippet}
					<div class="grid gap-2 sm:grid-cols-[1fr_10rem]">
						<div class="grid gap-1">
							<Label class="text-xs">{m.admin_manifest_ext_field_name()}</Label>
							<Input bind:value={fp.name} placeholder="x-tabularis" maxlength={60} oninput={() => commit()} />
						</div>
						<div class="grid gap-1">
							<Label class="text-xs">{m.admin_manifest_ext_field_type()}</Label>
							<select
								bind:value={fp.type}
								disabled={fp.isAdvanced}
								onchange={() => commit()}
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
							<Input
								bind:value={fp.description}
								maxlength={200}
								placeholder={m.admin_manifest_ext_description_placeholder()}
								oninput={() => commit()}
							/>
							{#if i18n.availableLocales.filter((l) => l !== i18n.defaultLocale).length > 0}
								<details class="text-xs mt-2">
									<summary class="cursor-pointer text-muted-foreground hover:text-foreground select-none">
										{m.admin_extensions_property_translations()}
									</summary>
									<div class="mt-2 space-y-2">
										{#each i18n.availableLocales.filter((l) => l !== i18n.defaultLocale) as locale (locale)}
											<div class="grid gap-1">
												<Label class="text-[10px] uppercase tracking-wider">
													{LOCALE_LABELS[locale] ?? locale}
												</Label>
												<Input
													value={fp.descriptionTranslations[locale] ?? ''}
													maxlength={200}
													placeholder={m.admin_extensions_translation_placeholder({
														locale: LOCALE_LABELS[locale] ?? locale,
													})}
													oninput={(e) => updateTranslation(idx, locale, (e.currentTarget as HTMLInputElement).value)}
												/>
											</div>
										{/each}
									</div>
								</details>
							{/if}
						</div>

						{#if fp.type === 'string'}
							<div class="grid sm:grid-cols-2 gap-2">
								<div class="grid gap-1">
									<Label class="text-xs">{m.admin_manifest_ext_string_enum()}</Label>
									<Input bind:value={fp.stringEnum} placeholder="light, dark, system" oninput={() => commit()} />
								</div>
								<div class="grid gap-1">
									<Label class="text-xs">{m.admin_manifest_ext_string_pattern()}</Label>
									<Input bind:value={fp.stringPattern} placeholder="^[a-z]+$" oninput={() => commit()} />
								</div>
							</div>
						{:else if fp.type === 'array'}
							<div class="grid gap-1 max-w-xs">
								<Label class="text-xs">{m.admin_manifest_ext_array_item_type()}</Label>
								<select
									bind:value={fp.arrayItemType}
									onchange={() => commit()}
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
								commit()
							}}
						>
							<Code class="h-3 w-3" />
							{m.admin_manifest_ext_advanced_toggle()}
						</button>
					{:else}
						<div class="grid gap-1">
							<Label class="text-xs">{m.admin_manifest_ext_advanced_json_label()}</Label>
							<JsonEditor bind:value={fp.advancedJson} minHeight="10rem" onchange={() => commit()} />
							<button
								type="button"
								class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors self-start"
								onclick={() => {
									try {
										const node = JSON.parse(fp.advancedJson) as SchemaNode
										fp.isAdvanced = false
										fp.type = (node.type as FormProperty['type']) ?? 'string'
										commit()
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
				</CollapsibleRow>
			{/each}

			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					addProperty()
				}}
			>
				<Plus class="h-3.5 w-3.5" />
				{m.admin_manifest_ext_add_property()}
			</Button>
		{/if}
	{:else}
		<div class="space-y-2">
			<JsonEditor bind:value={advancedJson} {minHeight} onchange={onJsonChange} />
			{#if advancedJsonError}
				<p class="text-xs text-destructive">{advancedJsonError}</p>
			{/if}
			<p class="text-xs text-muted-foreground">{m.admin_manifest_ext_json_hint()}</p>
		</div>
	{/if}
</div>
