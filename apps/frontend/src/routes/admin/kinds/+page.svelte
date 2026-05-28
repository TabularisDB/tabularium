<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Save from '@lucide/svelte/icons/save'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Languages from '@lucide/svelte/icons/languages'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import Label from '$components/ui/Label.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import CollapsibleRow from '$components/admin/CollapsibleRow.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'
	import ExtensionsEditor, { type ExtensionsDelta } from '$components/admin/ExtensionsEditor.svelte'
	import { eden } from '$lib/eden'
	import type { Kind } from '$lib/types'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'

	type KindRow = Kind & {
		extensionsSchema: ExtensionsDelta
		extOpen: boolean
		publicPageOpen: boolean
		publicPageEnabled: boolean
		publicPageHero: string
		publicPageIntro: string
		labelTranslationsMap: Record<Locale, string>
		descriptionTranslationsMap: Record<Locale, string>
		heroTranslationsMap: Record<Locale, string>
		introTranslationsMap: Record<Locale, string>
		prosePreText: string
		prosePreMap: Record<Locale, string>
		prosePostText: string
		prosePostMap: Record<Locale, string>
		customExampleYaml: string
		activeLocale: Locale
	}

	let kinds = $state<KindRow[]>([])
	let loading = $state(true)
	let newKey = $state('')
	let newLabel = $state('')
	let newDescription = $state('')
	let creating = $state(false)
	let savingKey = $state<string | null>(null)
	let deleteTarget = $state<Kind | null>(null)
	let deletingKey = $state<string | null>(null)

	onMount(loadKinds)

	function emptyByLocale(): Record<Locale, string> {
		return i18n.availableLocales.reduce(
			(acc, l) => {
				acc[l] = ''
				return acc
			},
			{} as Record<Locale, string>,
		)
	}

	function hydrateMap(source: Record<string, string> | undefined): Record<Locale, string> {
		const out = emptyByLocale()
		if (!source) return out
		for (const l of i18n.availableLocales) {
			const v = source[l]
			if (typeof v === 'string') out[l] = v
		}
		return out
	}

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	async function loadKinds() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.kinds.get()
			if (error) throw error
			const list = (
				data as {
					kinds: Array<
						Kind & {
							extensionsSchema?: Record<string, unknown> | null
							labelTranslations?: Record<string, string>
							descriptionTranslations?: Record<string, string>
							publicPageCopy?: {
								hero: string | null
								heroTranslations?: Record<string, string>
								intro: string | null
								introTranslations?: Record<string, string>
							} | null
							prosePre?: string | null
							prosePreTranslations?: Record<string, string>
							prosePost?: string | null
							prosePostTranslations?: Record<string, string>
							customExample?: { yaml?: string; json?: string } | null
						}
					>
				}
			).kinds
			kinds = list.map((k) => ({
				...k,
				extensionsSchema: (k.extensionsSchema as ExtensionsDelta | null) ?? {},
				extOpen: false,
				publicPageOpen: false,
				publicPageEnabled: k.publicPageEnabled === true,
				publicPageHero: k.publicPageCopy?.hero ?? '',
				publicPageIntro: k.publicPageCopy?.intro ?? '',
				labelTranslationsMap: hydrateMap(k.labelTranslations),
				descriptionTranslationsMap: hydrateMap(k.descriptionTranslations),
				heroTranslationsMap: hydrateMap(k.publicPageCopy?.heroTranslations),
				introTranslationsMap: hydrateMap(k.publicPageCopy?.introTranslations),
				prosePreText: k.prosePre ?? '',
				prosePreMap: hydrateMap(k.prosePreTranslations),
				prosePostText: k.prosePost ?? '',
				prosePostMap: hydrateMap(k.prosePostTranslations),
				customExampleYaml: k.customExample?.yaml ?? '',
				activeLocale: i18n.defaultLocale,
			}))
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_load_failed())
		} finally {
			loading = false
		}
	}

	async function addKind() {
		if (!newKey.trim() || !newLabel.trim()) return
		creating = true
		try {
			const { error } = await eden.api.admin.kinds.post({
				key: newKey.trim(),
				label: newLabel.trim(),
				description: newDescription.trim() || null,
			})
			if (error) {
				if (error.status === 409) toast.error(m.admin_kinds_duplicate())
				else toast.error(extractError(error))
				return
			}
			toast.success(m.admin_kinds_created())
			newKey = ''
			newLabel = ''
			newDescription = ''
			await loadKinds()
		} finally {
			creating = false
		}
	}

	function collectTranslations(
		map: Record<Locale, string>,
	): Partial<Record<Locale, string>> | undefined {
		const out: Partial<Record<Locale, string>> = {}
		for (const l of i18n.availableLocales) {
			if (l === i18n.defaultLocale) continue
			const v = map[l]?.trim()
			if (v) out[l] = v
		}
		return Object.keys(out).length > 0 ? out : undefined
	}

	async function saveKind(k: KindRow) {
		savingKey = k.key
		try {
			const extPayload = Object.keys(k.extensionsSchema).length === 0 ? null : k.extensionsSchema
			const heroTrim = k.publicPageHero.trim()
			const introTrim = k.publicPageIntro.trim()
			const labelTranslations = collectTranslations(k.labelTranslationsMap)
			const descriptionTranslations = collectTranslations(k.descriptionTranslationsMap)
			const heroTranslations = collectTranslations(k.heroTranslationsMap)
			const introTranslations = collectTranslations(k.introTranslationsMap)
			const prosePreTranslations = collectTranslations(k.prosePreMap)
			const prosePostTranslations = collectTranslations(k.prosePostMap)
			const prosePreTrim = k.prosePreText.trim()
			const prosePostTrim = k.prosePostText.trim()
			const customExampleTrim = k.customExampleYaml.trim()

			let publicPageCopy:
				| {
						hero: string | null
						intro: string | null
						heroTranslations?: Partial<Record<Locale, string>>
						introTranslations?: Partial<Record<Locale, string>>
				  }
				| null = null
			if (heroTrim || introTrim || heroTranslations || introTranslations) {
				publicPageCopy = {
					hero: heroTrim || null,
					intro: introTrim || null,
					...(heroTranslations ? { heroTranslations } : {}),
					...(introTranslations ? { introTranslations } : {}),
				}
			}

			const body: Parameters<ReturnType<typeof eden.api.admin.kinds>['put']>[0] = {
				key: k.key,
				label: k.label,
				description: k.description,
				extensionsSchema: extPayload,
				publicPageEnabled: k.publicPageEnabled,
				publicPageCopy,
				...(labelTranslations ? { labelTranslations } : {}),
				...(descriptionTranslations ? { descriptionTranslations } : {}),
				prosePre: prosePreTrim || null,
				...(prosePreTranslations ? { prosePreTranslations } : {}),
				prosePost: prosePostTrim || null,
				...(prosePostTranslations ? { prosePostTranslations } : {}),
				customExample: customExampleTrim ? { yaml: k.customExampleYaml } : null,
			}

			const { error } = await eden.api.admin.kinds({ key: k.key }).put(body)
			if (error) {
				toast.error(extractError(error))
				return
			}
			toast.success(m.admin_kinds_updated())
			await loadKinds()
		} finally {
			savingKey = null
		}
	}

	function openDeleteKind(k: Kind) {
		deleteTarget = k
	}

	async function confirmDeleteKind() {
		const k = deleteTarget
		if (!k) return
		deletingKey = k.key
		try {
			const { error } = await eden.api.admin.kinds({ key: k.key }).delete()
			if (error) {
				toast.error(extractError(error))
				return
			}
			toast.success(m.admin_kinds_deleted())
			deleteTarget = null
			await loadKinds()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_save_failed())
		} finally {
			deletingKey = null
		}
	}

	function onCreateKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			addKind()
		}
	}

	function onEditKey(e: KeyboardEvent, k: KindRow) {
		if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName === 'INPUT')) {
			e.preventDefault()
			saveKind(k)
		}
	}

	function isFilled(map: Record<Locale, string>, locale: Locale) {
		return Boolean(map[locale]?.trim())
	}
</script>

<AdminPageHeader title={m.admin_kinds_title()} subtitle={m.admin_kinds_subtitle()} />

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	{#if kinds.length === 0}
		<p class="text-sm text-muted-foreground italic">{m.admin_kinds_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each kinds as k (k.key)}
				<Card>
					<CardHeader>
						<CardTitle class="text-base font-mono">{k.key}</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex flex-wrap items-center gap-1">
							<Languages class="h-3.5 w-3.5 text-muted-foreground mr-1" />
							<span class="text-xs font-medium text-muted-foreground mr-2"
								>{m.admin_kinds_translations()}</span
							>
							{#each i18n.availableLocales as l (l)}
								<button
									type="button"
									class={[
										'rounded-md border px-2.5 py-1 text-xs transition-colors',
										k.activeLocale === l
											? 'border-primary text-foreground bg-primary/10'
											: 'border-border text-muted-foreground hover:bg-accent/50',
									].join(' ')}
									onclick={() => (k.activeLocale = l)}
								>
									{LOCALE_LABELS[l] ?? l}
									{#if l === i18n.defaultLocale}
										<span class="ml-1 text-[10px] uppercase tracking-wider text-primary"
											>{m.admin_branding_default()}</span
										>
									{:else if isFilled(k.labelTranslationsMap, l) || isFilled(k.descriptionTranslationsMap, l) || isFilled(k.heroTranslationsMap, l) || isFilled(k.introTranslationsMap, l) || isFilled(k.prosePreMap, l) || isFilled(k.prosePostMap, l)}
										<span class="ml-1 text-[10px] uppercase tracking-wider text-success">·</span>
									{/if}
								</button>
							{/each}
						</div>

						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground"
								>{k.activeLocale === i18n.defaultLocale
									? m.admin_kinds_field_label()
									: m.admin_kinds_label_in_locale({
											locale: LOCALE_LABELS[k.activeLocale] ?? k.activeLocale,
										})}</span
							>
							{#if k.activeLocale === i18n.defaultLocale}
								<Input bind:value={k.label} maxlength={60} onkeydown={(e) => onEditKey(e, k)} />
							{:else}
								<Input
									bind:value={k.labelTranslationsMap[k.activeLocale]}
									maxlength={60}
									placeholder={m.admin_branding_fallback_placeholder({
										locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
									})}
									onkeydown={(e) => onEditKey(e, k)}
								/>
							{/if}
						</label>

						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground"
								>{k.activeLocale === i18n.defaultLocale
									? m.admin_kinds_field_description()
									: m.admin_kinds_description_in_locale({
											locale: LOCALE_LABELS[k.activeLocale] ?? k.activeLocale,
										})}</span
							>
							{#if k.activeLocale === i18n.defaultLocale}
								<Input
									value={k.description ?? ''}
									maxlength={280}
									oninput={(e) => (k.description = (e.currentTarget as HTMLInputElement).value)}
									onkeydown={(e) => onEditKey(e, k)}
								/>
							{:else}
								<Input
									bind:value={k.descriptionTranslationsMap[k.activeLocale]}
									maxlength={280}
									placeholder={m.admin_branding_fallback_placeholder({
										locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
									})}
									onkeydown={(e) => onEditKey(e, k)}
								/>
							{/if}
						</label>

						<CollapsibleRow bind:expanded={k.extOpen} name={m.admin_kinds_ext_toggle()}>
							{#snippet header()}
								<span class="text-sm font-medium">{m.admin_kinds_ext_toggle()}</span>
								{#if Object.keys(k.extensionsSchema).length > 0}
									<span class="text-[10px] uppercase tracking-wide text-primary ml-2"
										>{m.admin_kinds_ext_override_active()}</span
									>
								{:else}
									<span class="text-xs text-muted-foreground ml-2 truncate">{m.admin_kinds_ext_empty_reverts()}</span>
								{/if}
							{/snippet}
							<p class="text-xs text-muted-foreground">{m.admin_kinds_ext_hint()}</p>
							<ExtensionsEditor bind:value={k.extensionsSchema} templates={false} minHeight="14rem" />
						</CollapsibleRow>

						<CollapsibleRow bind:expanded={k.publicPageOpen} name={m.admin_kinds_public_page_toggle()}>
							{#snippet header()}
								<span class="text-sm font-medium">{m.admin_kinds_public_page_toggle()}</span>
								{#if k.publicPageEnabled}
									<span class="text-[10px] uppercase tracking-wide text-primary ml-2"
										>{m.admin_kinds_public_page_enabled_pill()}</span
									>
								{:else}
									<span class="text-xs text-muted-foreground ml-2 truncate"
										>{m.admin_kinds_public_page_disabled_hint()}</span
									>
								{/if}
							{/snippet}
							<p class="text-xs text-muted-foreground">{m.admin_kinds_public_page_hint({ key: k.key })}</p>
							<label class="flex items-center gap-2 text-sm cursor-pointer">
								<input type="checkbox" bind:checked={k.publicPageEnabled} class="h-4 w-4 rounded border-input" />
								<span>{m.admin_kinds_public_page_enable({ key: k.key })}</span>
							</label>
							{#if k.publicPageEnabled}
								<label class="block space-y-1 mt-3">
									<span class="text-xs font-medium text-muted-foreground"
										>{k.activeLocale === i18n.defaultLocale
											? m.admin_kinds_public_page_hero()
											: m.admin_kinds_hero_in_locale({
													locale: LOCALE_LABELS[k.activeLocale] ?? k.activeLocale,
												})}</span
									>
									{#if k.activeLocale === i18n.defaultLocale}
										<Input bind:value={k.publicPageHero} placeholder={k.label} maxlength={80} />
									{:else}
										<Input
											bind:value={k.heroTranslationsMap[k.activeLocale]}
											maxlength={80}
											placeholder={m.admin_branding_fallback_placeholder({
												locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
											})}
										/>
									{/if}
								</label>
								<label class="block space-y-1 mt-3">
									<span class="text-xs font-medium text-muted-foreground"
										>{k.activeLocale === i18n.defaultLocale
											? m.admin_kinds_public_page_intro()
											: m.admin_kinds_intro_in_locale({
													locale: LOCALE_LABELS[k.activeLocale] ?? k.activeLocale,
												})}</span
									>
									{#if k.activeLocale === i18n.defaultLocale}
										<Input bind:value={k.publicPageIntro} placeholder={k.description ?? ''} maxlength={600} />
									{:else}
										<Input
											bind:value={k.introTranslationsMap[k.activeLocale]}
											maxlength={600}
											placeholder={m.admin_branding_fallback_placeholder({
												locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
											})}
										/>
									{/if}
								</label>
							{/if}
						</CollapsibleRow>

						<details class="text-xs mt-2">
							<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
								{m.admin_kinds_advanced()}
							</summary>
							<div class="mt-3 space-y-4">
								<div class="grid gap-2">
									<Label>{m.admin_kinds_prose_pre()}</Label>
									{#if k.activeLocale === i18n.defaultLocale}
										<Textarea bind:value={k.prosePreText} rows={4} maxlength={8000} />
									{:else}
										<Textarea
											bind:value={k.prosePreMap[k.activeLocale]}
											rows={4}
											maxlength={8000}
											placeholder={m.admin_branding_fallback_placeholder({
												locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
											})}
										/>
									{/if}
								</div>

								<div class="grid gap-2">
									<Label>{m.admin_kinds_prose_post()}</Label>
									{#if k.activeLocale === i18n.defaultLocale}
										<Textarea bind:value={k.prosePostText} rows={4} maxlength={8000} />
									{:else}
										<Textarea
											bind:value={k.prosePostMap[k.activeLocale]}
											rows={4}
											maxlength={8000}
											placeholder={m.admin_branding_fallback_placeholder({
												locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
											})}
										/>
									{/if}
								</div>

								<div class="grid gap-2">
									<Label>{m.admin_kinds_custom_example()}</Label>
									<Textarea
										bind:value={k.customExampleYaml}
										rows={8}
										maxlength={16000}
										placeholder={`name: my-plugin\nkind: ${k.key || 'theme'}\nversion: 1.0.0\n`}
									/>
									<p class="text-[10px] text-muted-foreground">{m.admin_kinds_custom_example_note()}</p>
								</div>
							</div>
						</details>

						<div class="flex gap-2 justify-end">
							<Button size="sm" variant="outline" onclick={() => openDeleteKind(k)}>
								<Trash2 class="h-3.5 w-3.5" />
								{m.admin_kinds_delete_button()}
							</Button>
							<Button size="sm" onclick={() => saveKind(k)} disabled={savingKey === k.key}>
								<Save class="h-3.5 w-3.5" />
								{savingKey === k.key ? m.common_saving() : m.common_save()}
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_kinds_add_heading()}</CardTitle>
			<CardDescription>{m.admin_kinds_field_key_hint()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_key()}</span>
				<Input bind:value={newKey} placeholder="theme" onkeydown={onCreateKey} />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_label()}</span>
				<Input bind:value={newLabel} placeholder="Themes" onkeydown={onCreateKey} />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_description()}</span>
				<Input bind:value={newDescription} onkeydown={onCreateKey} />
			</label>
			<div class="flex justify-end">
				<Button size="sm" onclick={addKind} disabled={creating || !newKey.trim() || !newLabel.trim()}>
					<Plus class="h-3.5 w-3.5" />
					{m.admin_kinds_add_button()}
				</Button>
			</div>
		</CardContent>
	</Card>
{/if}

{#if deleteTarget}
	<ConfirmDialog
		open={deleteTarget !== null}
		title={m.admin_kinds_delete_button()}
		description={m.admin_kinds_delete_confirm()}
		confirmWord={deleteTarget.key}
		confirmLabel={m.admin_kinds_delete_button()}
		busy={deletingKey === deleteTarget.key}
		onConfirm={confirmDeleteKind}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}
