<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Code from '@lucide/svelte/icons/code'
	import LayoutList from '@lucide/svelte/icons/layout-list'
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
	}

	type Mode = 'form' | 'json'

	let loading = $state(true)
	let saving = $state(false)
	let mode = $state<Mode>('form')
	let formProps = $state<FormProperty[]>([])
	let advancedJson = $state('')
	let advancedJsonError = $state<string | null>(null)
	let coreProperties = $state<string[]>([])

	function emptyProperty(): FormProperty {
		return {
			name: '',
			type: 'string',
			description: '',
			isAdvanced: false,
			advancedJson: '',
			stringEnum: '',
			stringPattern: '',
			arrayItemType: 'string',
		}
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
		const fp = emptyProperty()
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

	function isSimpleArray(node: SchemaNode): boolean {
		const items = node.items as SchemaNode | undefined
		if (!items || typeof items.type !== 'string') return false
		return ['string', 'number', 'integer', 'boolean'].includes(items.type)
	}

	function formToNode(fp: FormProperty): SchemaNode {
		if (fp.isAdvanced) {
			return JSON.parse(fp.advancedJson)
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
			out[fp.name.trim()] = formToNode(fp)
		}
		return out
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.manifest.extensions.get()
			if (error) throw new Error(extractError(error))
			const res = data as { extensions: ExtensionsDelta; mergedSchema: { properties?: Record<string, unknown> } }
			coreProperties = Object.keys(res.mergedSchema.properties ?? {}).filter(
				(k) => !(k in res.extensions),
			)
			const entries = Object.entries(res.extensions)
			formProps = entries.length > 0 ? entries.map(([n, node]) => nodeToForm(n, node)) : []
			advancedJson = JSON.stringify(res.extensions, null, 2)
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

	function addProperty() {
		formProps = [...formProps, emptyProperty()]
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
					formProps = Object.entries(parsed as ExtensionsDelta).map(([n, node]) => nodeToForm(n, node))
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

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_manifest_core_card_title()}</CardTitle>
		<CardDescription>{m.admin_manifest_core_card_subtitle()}</CardDescription>
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
			<p class="text-xs text-muted-foreground">{m.admin_manifest_core_locked_hint()}</p>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<div class="flex items-start justify-between gap-3">
			<div class="space-y-1">
				<CardTitle class="text-base">{m.admin_manifest_ext_card_title()}</CardTitle>
				<CardDescription>{m.admin_manifest_ext_card_subtitle()}</CardDescription>
			</div>
			<div class="inline-flex rounded-md border border-border bg-card/50 p-0.5 text-xs">
				<button
					type="button"
					class="px-2.5 py-1 rounded inline-flex items-center gap-1.5 {mode === 'form' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}"
					onclick={() => switchMode('form')}
				>
					<LayoutList class="h-3 w-3" />
					{m.admin_manifest_ext_form_mode()}
				</button>
				<button
					type="button"
					class="px-2.5 py-1 rounded inline-flex items-center gap-1.5 {mode === 'json' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}"
					onclick={() => switchMode('json')}
				>
					<Code class="h-3 w-3" />
					{m.admin_manifest_ext_json_mode()}
				</button>
			</div>
		</div>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if mode === 'form'}
			{#if formProps.length === 0}
				<p class="text-sm text-muted-foreground">{m.admin_manifest_ext_empty()}</p>
			{/if}
			{#each formProps as fp, idx (idx)}
				<div class="rounded-md border border-border bg-card/50 p-3 space-y-3">
					<div class="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
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
						<Button variant="ghost" size="sm" onclick={() => removeProperty(idx)} aria-label={m.common_remove()}>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
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

						<label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
							<input
								type="checkbox"
								class="h-3.5 w-3.5 rounded border-input"
								checked={fp.isAdvanced}
								onchange={() => {
									fp.isAdvanced = true
									if (!fp.advancedJson) fp.advancedJson = JSON.stringify(formToNode(fp), null, 2)
								}}
							/>
							{m.admin_manifest_ext_advanced_toggle()}
						</label>
					{:else}
						<div class="grid gap-1">
							<Label class="text-xs">{m.admin_manifest_ext_advanced_json_label()}</Label>
							<textarea
								bind:value={fp.advancedJson}
								class="font-mono text-xs min-h-32 rounded-md border border-input bg-card px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								spellcheck="false"
							></textarea>
							<button
								type="button"
								class="text-xs text-muted-foreground hover:text-foreground underline self-start"
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
								{m.admin_manifest_ext_advanced_back_to_form()}
							</button>
						</div>
					{/if}
				</div>
			{/each}

			<Button variant="outline" size="sm" onclick={addProperty}>
				<Plus class="h-3.5 w-3.5" />
				{m.admin_manifest_ext_add_property()}
			</Button>
		{:else}
			<div class="space-y-2">
				<Label class="text-xs">{m.admin_manifest_ext_json_label()}</Label>
				<textarea
					bind:value={advancedJson}
					oninput={() => (advancedJsonError = null)}
					class="font-mono text-xs min-h-64 w-full rounded-md border border-input bg-card px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					spellcheck="false"
				></textarea>
				{#if advancedJsonError}
					<p class="text-xs text-destructive">{advancedJsonError}</p>
				{/if}
				<p class="text-xs text-muted-foreground">{m.admin_manifest_ext_json_hint()}</p>
			</div>
		{/if}
	</CardContent>
</Card>

<div class="flex justify-end">
	<Button size="sm" onclick={save} disabled={saving || loading}>
		<Save class="h-3.5 w-3.5" />
		{saving ? m.common_saving() : m.common_save()}
	</Button>
</div>
