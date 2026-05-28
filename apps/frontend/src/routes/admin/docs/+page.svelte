<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Languages from '@lucide/svelte/icons/languages'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'

	type FixedPosition =
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
	type PositionMarker = FixedPosition | { kind: string; slot: 'before' | 'after' }

	type CustomSection = {
		id: string
		title: string | null
		titleTranslations?: Record<string, string>
		body: string
		bodyTranslations?: Record<string, string>
		position: PositionMarker
	}

	type DocsConfig = {
		introMarkdown: string | null
		introMarkdownTranslations: Record<string, string>
		outroMarkdown: string | null
		outroMarkdownTranslations: Record<string, string>
		customSections: CustomSection[]
	}

	type SectionRow = {
		id: string
		title: string
		titleMap: Record<Locale, string>
		body: string
		bodyMap: Record<Locale, string>
		position: FixedPosition | 'kind'
		kindKey: string
		slot: 'before' | 'after'
		activeLocale: Locale
		isNew: boolean // not yet saved on the server
	}

	function emptyByLocale(): Record<Locale, string> {
		return i18n.availableLocales.reduce(
			(acc, l) => {
				acc[l] = ''
				return acc
			},
			{} as Record<Locale, string>,
		)
	}

	let loading = $state(true)
	let saving = $state(false)
	let intro = $state('')
	let introMap = $state<Record<Locale, string>>(emptyByLocale())
	let outro = $state('')
	let outroMap = $state<Record<Locale, string>>(emptyByLocale())
	let introActiveLocale = $state<Locale>(i18n.defaultLocale)
	let outroActiveLocale = $state<Locale>(i18n.defaultLocale)
	let sections = $state<SectionRow[]>([])

	const FIXED_POSITIONS: FixedPosition[] = [
		'page_top',
		'before_core',
		'after_core',
		'before_extensions',
		'after_extensions',
		'before_kinds',
		'after_kinds',
		'before_api',
		'after_api',
		'page_bottom',
	]

	function labelForPosition(p: FixedPosition | 'kind'): string {
		switch (p) {
			case 'page_top':
				return m.admin_docs_position_page_top()
			case 'page_bottom':
				return m.admin_docs_position_page_bottom()
			case 'before_core':
				return m.admin_docs_position_before_core()
			case 'after_core':
				return m.admin_docs_position_after_core()
			case 'before_extensions':
				return m.admin_docs_position_before_extensions()
			case 'after_extensions':
				return m.admin_docs_position_after_extensions()
			case 'before_kinds':
				return m.admin_docs_position_before_kinds()
			case 'after_kinds':
				return m.admin_docs_position_after_kinds()
			case 'before_api':
				return m.admin_docs_position_before_api()
			case 'after_api':
				return m.admin_docs_position_after_api()
			case 'kind':
				return m.admin_docs_position_kind()
		}
	}

	function hydrateMap(source: Record<string, string> | undefined): Record<Locale, string> {
		const out = emptyByLocale()
		if (!source) return out
		for (const l of i18n.availableLocales) {
			if (typeof source[l] === 'string') out[l] = source[l]
		}
		return out
	}

	function rowFromSection(s: CustomSection): SectionRow {
		let position: FixedPosition | 'kind'
		let kindKey = ''
		let slot: 'before' | 'after' = 'before'
		if (typeof s.position === 'string') {
			position = s.position
		} else {
			position = 'kind'
			kindKey = s.position.kind
			slot = s.position.slot
		}
		return {
			id: s.id,
			title: s.title ?? '',
			titleMap: hydrateMap(s.titleTranslations),
			body: s.body,
			bodyMap: hydrateMap(s.bodyTranslations),
			position,
			kindKey,
			slot,
			activeLocale: i18n.defaultLocale,
			isNew: false,
		}
	}

	async function load() {
		loading = true
		try {
			const res = await fetch('/api/admin/docs', { credentials: 'include' })
			if (!res.ok) throw new Error(`Load failed: ${res.status}`)
			const data = (await res.json()) as { config: DocsConfig }
			intro = data.config.introMarkdown ?? ''
			introMap = hydrateMap(data.config.introMarkdownTranslations)
			outro = data.config.outroMarkdown ?? ''
			outroMap = hydrateMap(data.config.outroMarkdownTranslations)
			sections = data.config.customSections.map(rowFromSection)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_docs_load_failed())
		} finally {
			loading = false
		}
	}

	onMount(load)

	function collectTranslations(map: Record<Locale, string>): Record<string, string> | undefined {
		const out: Record<string, string> = {}
		for (const l of i18n.availableLocales) {
			if (l === i18n.defaultLocale) continue
			const v = map[l]?.trim()
			if (v) out[l] = v
		}
		return Object.keys(out).length > 0 ? out : undefined
	}

	async function saveIntroOutro() {
		saving = true
		try {
			const introTrans = collectTranslations(introMap)
			const outroTrans = collectTranslations(outroMap)
			const body = {
				intro: { body: intro.trim() ? intro : null, translations: introTrans ?? {} },
				outro: { body: outro.trim() ? outro : null, translations: outroTrans ?? {} },
			}
			const res = await fetch('/api/admin/docs', {
				method: 'PUT',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error ?? `Save failed: ${res.status}`)
			}
			toast.success(m.admin_docs_saved())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_docs_save_failed())
		} finally {
			saving = false
		}
	}

	function rowToBody(r: SectionRow): unknown {
		const titleTrans = collectTranslations(r.titleMap)
		const bodyTrans = collectTranslations(r.bodyMap)
		const position =
			r.position === 'kind' ? { kind: r.kindKey, slot: r.slot } : r.position
		return {
			id: r.id,
			title: r.title.trim() ? r.title : null,
			...(titleTrans ? { titleTranslations: titleTrans } : {}),
			body: r.body,
			...(bodyTrans ? { bodyTranslations: bodyTrans } : {}),
			position,
		}
	}

	async function saveSection(r: SectionRow) {
		try {
			const body = JSON.stringify(rowToBody(r))
			const url = r.isNew
				? '/api/admin/docs/sections'
				: `/api/admin/docs/sections/${encodeURIComponent(r.id)}`
			const method = r.isNew ? 'POST' : 'PUT'
			const res = await fetch(url, {
				method,
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body,
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error ?? `Save failed: ${res.status}`)
			}
			r.isNew = false
			toast.success(m.admin_docs_saved())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_docs_save_failed())
		}
	}

	async function deleteSection(r: SectionRow) {
		if (r.isNew) {
			sections = sections.filter((s) => s !== r)
			return
		}
		if (!confirm(m.admin_docs_delete_confirm({ id: r.id }))) return
		try {
			const res = await fetch(`/api/admin/docs/sections/${encodeURIComponent(r.id)}`, {
				method: 'DELETE',
				credentials: 'include',
			})
			if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
			sections = sections.filter((s) => s !== r)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_docs_save_failed())
		}
	}

	function addSection() {
		sections = [
			...sections,
			{
				id: '',
				title: '',
				titleMap: emptyByLocale(),
				body: '',
				bodyMap: emptyByLocale(),
				position: 'page_top',
				kindKey: '',
				slot: 'before',
				activeLocale: i18n.defaultLocale,
				isNew: true,
			},
		]
	}
</script>

<AdminPageHeader title={m.admin_docs_title()} subtitle={m.admin_docs_subtitle()} />

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Languages class="h-4 w-4" />
				{m.admin_docs_intro()}
			</CardTitle>
			<CardDescription>{m.admin_docs_intro_note()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			<div class="flex flex-wrap gap-1">
				{#each i18n.availableLocales as l (l)}
					<button
						type="button"
						class={[
							'rounded-md border px-2.5 py-1 text-xs transition-colors',
							introActiveLocale === l
								? 'border-primary text-foreground bg-primary/10'
								: 'border-border text-muted-foreground hover:bg-accent/50',
						].join(' ')}
						onclick={() => (introActiveLocale = l)}
					>
						{LOCALE_LABELS[l] ?? l}
					</button>
				{/each}
			</div>
			{#if introActiveLocale === i18n.defaultLocale}
				<Textarea bind:value={intro} rows={6} maxlength={16000} />
			{:else}
				<Textarea bind:value={introMap[introActiveLocale]} rows={6} maxlength={16000} />
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Languages class="h-4 w-4" />
				{m.admin_docs_outro()}
			</CardTitle>
			<CardDescription>{m.admin_docs_outro_note()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			<div class="flex flex-wrap gap-1">
				{#each i18n.availableLocales as l (l)}
					<button
						type="button"
						class={[
							'rounded-md border px-2.5 py-1 text-xs transition-colors',
							outroActiveLocale === l
								? 'border-primary text-foreground bg-primary/10'
								: 'border-border text-muted-foreground hover:bg-accent/50',
						].join(' ')}
						onclick={() => (outroActiveLocale = l)}
					>
						{LOCALE_LABELS[l] ?? l}
					</button>
				{/each}
			</div>
			{#if outroActiveLocale === i18n.defaultLocale}
				<Textarea bind:value={outro} rows={6} maxlength={16000} />
			{:else}
				<Textarea bind:value={outroMap[outroActiveLocale]} rows={6} maxlength={16000} />
			{/if}
		</CardContent>
	</Card>

	<div class="flex justify-end">
		<Button size="sm" onclick={saveIntroOutro} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{m.admin_docs_save()}
		</Button>
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_docs_sections()}</CardTitle>
			<CardDescription>{m.admin_docs_sections_note()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if sections.length === 0}
				<p class="text-sm text-muted-foreground">{m.admin_docs_no_sections()}</p>
			{/if}
			{#each sections as section, idx (idx)}
				<div class="border border-border rounded-md p-4 space-y-3">
					<div class="grid gap-2 md:grid-cols-2">
						<div class="grid gap-1">
							<Label>{m.admin_docs_section_id()}</Label>
							<Input bind:value={section.id} disabled={!section.isNew} maxlength={60} />
							<p class="text-[10px] text-muted-foreground">{m.admin_docs_section_id_note()}</p>
						</div>
						<div class="grid gap-1">
							<Label>{m.admin_docs_section_position()}</Label>
							<select
								bind:value={section.position}
								class="h-9 rounded-md border border-input bg-card px-3 text-sm"
							>
								{#each FIXED_POSITIONS as p (p)}
									<option value={p}>{labelForPosition(p)}</option>
								{/each}
								<option value="kind">{labelForPosition('kind')}</option>
							</select>
						</div>
						{#if section.position === 'kind'}
							<div class="grid gap-1">
								<Label>{m.admin_docs_section_kind_key()}</Label>
								<Input bind:value={section.kindKey} maxlength={40} placeholder="theme" />
							</div>
							<div class="grid gap-1">
								<Label>{m.admin_docs_section_slot()}</Label>
								<select
									bind:value={section.slot}
									class="h-9 rounded-md border border-input bg-card px-3 text-sm"
								>
									<option value="before">{m.admin_docs_slot_before()}</option>
									<option value="after">{m.admin_docs_slot_after()}</option>
								</select>
							</div>
						{/if}
					</div>

					<div class="flex flex-wrap gap-1">
						{#each i18n.availableLocales as l (l)}
							<button
								type="button"
								class={[
									'rounded-md border px-2.5 py-1 text-xs transition-colors',
									section.activeLocale === l
										? 'border-primary text-foreground bg-primary/10'
										: 'border-border text-muted-foreground hover:bg-accent/50',
								].join(' ')}
								onclick={() => (section.activeLocale = l)}
							>
								{LOCALE_LABELS[l] ?? l}
							</button>
						{/each}
					</div>

					<div class="grid gap-2">
						<Label>{m.admin_docs_section_title()}</Label>
						{#if section.activeLocale === i18n.defaultLocale}
							<Input bind:value={section.title} maxlength={200} />
						{:else}
							<Input bind:value={section.titleMap[section.activeLocale]} maxlength={200} />
						{/if}
					</div>

					<div class="grid gap-2">
						<Label>{m.admin_docs_section_body()}</Label>
						{#if section.activeLocale === i18n.defaultLocale}
							<Textarea bind:value={section.body} rows={6} maxlength={16000} />
						{:else}
							<Textarea bind:value={section.bodyMap[section.activeLocale]} rows={6} maxlength={16000} />
						{/if}
					</div>

					<div class="flex justify-end gap-2">
						<Button variant="ghost" size="sm" onclick={() => deleteSection(section)}>
							<Trash2 class="h-3.5 w-3.5" />
							{m.admin_docs_delete()}
						</Button>
						<Button size="sm" onclick={() => saveSection(section)}>
							<Save class="h-3.5 w-3.5" />
							{m.admin_docs_save()}
						</Button>
					</div>
				</div>
			{/each}

			<div class="flex justify-start">
				<Button variant="ghost" size="sm" onclick={addSection}>
					<Plus class="h-3.5 w-3.5" />
					{m.admin_docs_add_section()}
				</Button>
			</div>
		</CardContent>
	</Card>
{/if}
