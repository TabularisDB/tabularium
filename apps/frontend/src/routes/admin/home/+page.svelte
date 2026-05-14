<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Languages from '@lucide/svelte/icons/languages'
	import House from '@lucide/svelte/icons/house'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import Label from '$components/ui/Label.svelte'
	import { eden } from '$lib/eden'
	import { homeCopy, defaultHomeCopy, type HomeCopy } from '$lib/stores/home-copy.svelte'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'

	type LocaleMap = Record<Locale, string>

	type FeatureSection = {
		title: LocaleMap
		body: LocaleMap
	}

	type FormState = {
		eyebrowEnabled: boolean
		eyebrowText: LocaleMap
		featuresEnabled: boolean
		dropin: FeatureSection
		providers: FeatureSection
		release: FeatureSection
	}

	function emptyMap(): LocaleMap {
		return i18n.availableLocales.reduce((acc, l) => {
			acc[l] = ''
			return acc
		}, {} as LocaleMap)
	}

	function emptySection(): FeatureSection {
		return { title: emptyMap(), body: emptyMap() }
	}

	function fromHomeCopy(c: HomeCopy): FormState {
		const fill = (src: Partial<Record<Locale, string>>): LocaleMap => {
			const out = emptyMap()
			for (const l of i18n.availableLocales) out[l] = src[l] ?? ''
			return out
		}
		const section = (s: { title: Partial<Record<Locale, string>>; body: Partial<Record<Locale, string>> }): FeatureSection => ({
			title: fill(s.title),
			body: fill(s.body),
		})
		return {
			eyebrowEnabled: c.eyebrow.enabled,
			eyebrowText: fill(c.eyebrow.text),
			featuresEnabled: c.features.enabled,
			dropin: section(c.features.dropin),
			providers: section(c.features.providers),
			release: section(c.features.release),
		}
	}

	function toHomeCopy(f: FormState): HomeCopy {
		const compact = (m: LocaleMap): Partial<Record<Locale, string>> => {
			const out: Partial<Record<Locale, string>> = {}
			for (const l of i18n.availableLocales) {
				const v = (m[l] ?? '').trim()
				if (v.length > 0) out[l] = v
			}
			return out
		}
		return {
			eyebrow: { enabled: f.eyebrowEnabled, text: compact(f.eyebrowText) },
			features: {
				enabled: f.featuresEnabled,
				dropin: { title: compact(f.dropin.title), body: compact(f.dropin.body) },
				providers: { title: compact(f.providers.title), body: compact(f.providers.body) },
				release: { title: compact(f.release.title), body: compact(f.release.body) },
			},
		}
	}

	let form = $state<FormState>(fromHomeCopy(defaultHomeCopy()))
	let loading = $state(true)
	let saving = $state(false)
	let activeLocale = $state<Locale>(i18n.defaultLocale)

	const DEFAULT_BY_LOCALE = $derived.by(() => {
		const out: Record<Locale, {
			eyebrow: string
			dropinTitle: string
			dropinBody: string
			providersTitle: string
			providersBody: string
			releaseTitle: string
			releaseBody: string
		}> = {} as never
		for (const l of i18n.availableLocales) {
			out[l] = {
				eyebrow: m.home_eyebrow({}, { locale: l }),
				dropinTitle: m.home_feature_dropin_title({}, { locale: l }),
				dropinBody: m.home_feature_dropin_body({}, { locale: l }),
				providersTitle: m.home_feature_providers_title({}, { locale: l }),
				providersBody: m.home_feature_providers_body({}, { locale: l }),
				releaseTitle: m.home_feature_release_title({}, { locale: l }),
				releaseBody: m.home_feature_release_body({}, { locale: l }),
			}
		}
		return out
	})

	async function load() {
		try {
			const { data, error } = await eden.api['home-copy'].get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			form = fromHomeCopy(data as HomeCopy)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_home_load_failed())
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function save() {
		saving = true
		try {
			const body = toHomeCopy(form)
			const { data, error } = await eden.api.admin['home-copy'].put(body)
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const saved = data as HomeCopy
			homeCopy.setLocal(saved)
			form = fromHomeCopy(saved)
			toast.success(m.admin_home_saved())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_home_save_failed())
		} finally {
			saving = false
		}
	}

	function isFilled(map: LocaleMap, locale: Locale) {
		return Boolean(map[locale]?.trim())
	}

	function anyFilled(section: FeatureSection): boolean {
		for (const l of i18n.availableLocales) {
			if (section.title[l]?.trim() || section.body[l]?.trim()) return true
		}
		return false
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
		<House class="h-5 w-5 text-primary" />
		{m.admin_home_title()}
	</h1>
	<p class="text-sm text-muted-foreground">{m.admin_home_subtitle()}</p>
</header>

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	<div class="flex flex-wrap gap-1">
		{#each i18n.availableLocales as l (l)}
			<button
				type="button"
				class={['rounded-md border px-2.5 py-1 text-xs transition-colors',
					activeLocale === l ? 'border-primary text-foreground bg-primary/10' : 'border-border text-muted-foreground hover:bg-accent/50'].join(' ')}
				onclick={() => (activeLocale = l)}
			>
				{LOCALE_LABELS[l] ?? l}
				{#if l === i18n.defaultLocale}
					<span class="ml-1 text-[10px] uppercase tracking-wider text-primary">{m.admin_branding_default()}</span>
				{/if}
			</button>
		{/each}
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Languages class="h-4 w-4" />
				{m.admin_home_eyebrow_card_title()}
			</CardTitle>
			<CardDescription>{m.admin_home_eyebrow_card_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<label class="flex items-center gap-3 cursor-pointer select-none">
				<input type="checkbox" bind:checked={form.eyebrowEnabled} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">{m.admin_home_eyebrow_enabled()}</span>
			</label>

			<div class="grid gap-2">
				<Label for="eyebrow-text">
					{m.admin_home_field_text()}
					<span class="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">{LOCALE_LABELS[activeLocale] ?? activeLocale}</span>
					{#if isFilled(form.eyebrowText, activeLocale)}
						<span class="ml-1 text-[10px] uppercase tracking-wider text-success">·</span>
					{/if}
				</Label>
				<Input id="eyebrow-text" bind:value={form.eyebrowText[activeLocale]} maxlength={280} placeholder={DEFAULT_BY_LOCALE[activeLocale].eyebrow} />
				<p class="text-xs text-muted-foreground">{m.admin_home_default_hint({ value: DEFAULT_BY_LOCALE[activeLocale].eyebrow })}</p>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Languages class="h-4 w-4" />
				{m.admin_home_features_card_title()}
			</CardTitle>
			<CardDescription>{m.admin_home_features_card_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			<label class="flex items-center gap-3 cursor-pointer select-none">
				<input type="checkbox" bind:checked={form.featuresEnabled} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">{m.admin_home_features_enabled()}</span>
			</label>

			<div class="rounded-md border border-border bg-card/40 p-4 space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold tracking-tight">{m.admin_home_feature_dropin()}</h3>
					{#if anyFilled(form.dropin)}
						<span class="text-[10px] uppercase tracking-wider text-success">·</span>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="dropin-title">{m.admin_home_field_title()}</Label>
					<Input id="dropin-title" bind:value={form.dropin.title[activeLocale]} maxlength={280} placeholder={DEFAULT_BY_LOCALE[activeLocale].dropinTitle} />
					<p class="text-xs text-muted-foreground">{m.admin_home_default_hint({ value: DEFAULT_BY_LOCALE[activeLocale].dropinTitle })}</p>
				</div>
				<div class="grid gap-2">
					<Label for="dropin-body">{m.admin_home_field_body()}</Label>
					<Textarea id="dropin-body" bind:value={form.dropin.body[activeLocale]} maxlength={280} rows={3} placeholder={DEFAULT_BY_LOCALE[activeLocale].dropinBody} />
					<p class="text-xs text-muted-foreground">{m.admin_home_default_hint({ value: DEFAULT_BY_LOCALE[activeLocale].dropinBody })}</p>
				</div>
			</div>

			<div class="rounded-md border border-border bg-card/40 p-4 space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold tracking-tight">{m.admin_home_feature_providers()}</h3>
					{#if anyFilled(form.providers)}
						<span class="text-[10px] uppercase tracking-wider text-success">·</span>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="providers-title">{m.admin_home_field_title()}</Label>
					<Input id="providers-title" bind:value={form.providers.title[activeLocale]} maxlength={280} placeholder={DEFAULT_BY_LOCALE[activeLocale].providersTitle} />
					<p class="text-xs text-muted-foreground">{m.admin_home_default_hint({ value: DEFAULT_BY_LOCALE[activeLocale].providersTitle })}</p>
				</div>
				<div class="grid gap-2">
					<Label for="providers-body">{m.admin_home_field_body()}</Label>
					<Textarea id="providers-body" bind:value={form.providers.body[activeLocale]} maxlength={280} rows={3} placeholder={DEFAULT_BY_LOCALE[activeLocale].providersBody} />
					<p class="text-xs text-muted-foreground">{m.admin_home_default_hint({ value: DEFAULT_BY_LOCALE[activeLocale].providersBody })}</p>
				</div>
			</div>

			<div class="rounded-md border border-border bg-card/40 p-4 space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold tracking-tight">{m.admin_home_feature_release()}</h3>
					{#if anyFilled(form.release)}
						<span class="text-[10px] uppercase tracking-wider text-success">·</span>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="release-title">{m.admin_home_field_title()}</Label>
					<Input id="release-title" bind:value={form.release.title[activeLocale]} maxlength={280} placeholder={DEFAULT_BY_LOCALE[activeLocale].releaseTitle} />
					<p class="text-xs text-muted-foreground">{m.admin_home_default_hint({ value: DEFAULT_BY_LOCALE[activeLocale].releaseTitle })}</p>
				</div>
				<div class="grid gap-2">
					<Label for="release-body">{m.admin_home_field_body()}</Label>
					<Textarea id="release-body" bind:value={form.release.body[activeLocale]} maxlength={280} rows={3} placeholder={DEFAULT_BY_LOCALE[activeLocale].releaseBody} />
					<p class="text-xs text-muted-foreground">{m.admin_home_default_hint({ value: DEFAULT_BY_LOCALE[activeLocale].releaseBody })}</p>
				</div>
			</div>
		</CardContent>
	</Card>

	<div class="flex justify-end">
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? m.common_saving() : m.admin_branding_save_all()}
		</Button>
	</div>
{/if}
