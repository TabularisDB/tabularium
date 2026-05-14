<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
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
	import { eden } from '$lib/eden'
	import { branding, type Branding } from '$lib/stores/branding.svelte'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'

	type LocalizedBranding = Branding & {
		taglineTranslations: Partial<Record<Locale, string>>
		footerTextTranslations: Partial<Record<Locale, string>>
	}

	type FormState = {
		name: string
		primaryHex: string
		accentHex: string
		successHex: string
		logoUrl: string
		faviconUrl: string
		analyticsScript: string
		allowIndexing: boolean
		taglines: Record<Locale, string>
		footers: Record<Locale, string>
	}

	function emptyByLocale(): Record<Locale, string> {
		return i18n.availableLocales.reduce((acc, l) => {
			acc[l] = ''
			return acc
		}, {} as Record<Locale, string>)
	}

	let form = $state<FormState>({
		name: '',
		primaryHex: '#3b82f6', accentHex: '#8b5cf6', successHex: '#10b981',
		logoUrl: '', faviconUrl: '',
		analyticsScript: '',
		allowIndexing: true,
		taglines: {} as Record<Locale, string>,
		footers: {} as Record<Locale, string>,
	})
	let defaults = $state<Branding | null>(null)
	let loading = $state(true)
	let saving = $state(false)
	let activeLocale = $state<Locale>(i18n.defaultLocale)

	function toForm(b: LocalizedBranding): FormState {
		const taglines = emptyByLocale()
		const footers = emptyByLocale()
		for (const l of i18n.availableLocales) {
			taglines[l] = b.taglineTranslations[l] ?? ''
			footers[l] = b.footerTextTranslations[l] ?? ''
		}
		const fallbackLocale = i18n.defaultLocale
		if (!taglines[fallbackLocale]) taglines[fallbackLocale] = b.tagline
		if (!footers[fallbackLocale] && b.footerText) footers[fallbackLocale] = b.footerText
		return {
			name: b.name,
			primaryHex: b.primaryHex,
			accentHex: b.accentHex,
			successHex: b.successHex,
			logoUrl: b.logoUrl ?? '',
			faviconUrl: b.faviconUrl ?? '',
			analyticsScript: b.analyticsScript ?? '',
			allowIndexing: b.allowIndexing,
			taglines,
			footers,
		}
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.branding.get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as { current: LocalizedBranding; defaults: Branding }
			form = toForm(res.current)
			defaults = res.defaults
			activeLocale = i18n.defaultLocale
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_branding_load_failed())
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function save() {
		saving = true
		try {
			const fallback = i18n.defaultLocale
			const taglineTranslations: Partial<Record<Locale, string | null>> = {}
			const footerTextTranslations: Partial<Record<Locale, string | null>> = {}
			for (const l of i18n.availableLocales) {
				taglineTranslations[l] = form.taglines[l]?.trim() ? form.taglines[l] : null
				footerTextTranslations[l] = form.footers[l]?.trim() ? form.footers[l] : null
			}
			const body = {
				name: form.name,
				tagline: form.taglines[fallback] ?? '',
				footerText: form.footers[fallback] || null,
				primaryHex: form.primaryHex,
				accentHex: form.accentHex,
				successHex: form.successHex,
				logoUrl: form.logoUrl || null,
				faviconUrl: form.faviconUrl || null,
				analyticsScript: form.analyticsScript || null,
				allowIndexing: form.allowIndexing,
				taglineTranslations,
				footerTextTranslations,
			}
			const { data, error } = await eden.api.admin.branding.put(body)
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as { ok: boolean; branding: LocalizedBranding }
			branding.set(res.branding)
			form = toForm(res.branding)
			toast.success(m.admin_branding_saved())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_branding_save_failed())
		} finally {
			saving = false
		}
	}

	function resetField(key: 'name' | 'primaryHex' | 'accentHex' | 'successHex' | 'logoUrl' | 'faviconUrl' | 'analyticsScript' | 'allowIndexing') {
		if (!defaults) return
		const d = defaults
		if (key === 'name') form.name = d.name
		else if (key === 'primaryHex') form.primaryHex = d.primaryHex
		else if (key === 'accentHex') form.accentHex = d.accentHex
		else if (key === 'successHex') form.successHex = d.successHex
		else if (key === 'logoUrl') form.logoUrl = d.logoUrl ?? ''
		else if (key === 'faviconUrl') form.faviconUrl = d.faviconUrl ?? ''
		else if (key === 'analyticsScript') form.analyticsScript = d.analyticsScript ?? ''
		else if (key === 'allowIndexing') form.allowIndexing = d.allowIndexing
	}

	function resetTagline(locale: Locale) {
		if (!defaults) return
		form.taglines[locale] = locale === i18n.defaultLocale ? defaults.tagline : ''
	}

	function resetFooter(locale: Locale) {
		form.footers[locale] = ''
	}

	function isFilled(map: Record<Locale, string>, locale: Locale) {
		return Boolean(map[locale]?.trim())
	}

	const ANALYTICS_PLACEHOLDER = `<${'script'} defer data-domain="example.com" src="https://plausible.io/js/script.js"></${'script'}>`
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_branding_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_branding_subtitle()}</p>
</header>

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_branding_identity()}</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-md">
				<Label for="name">{m.admin_branding_instance_name()}</Label>
				<div class="flex gap-2">
					<Input id="name" bind:value={form.name} maxlength={60} />
					<Button variant="ghost" size="sm" onclick={() => resetField('name')} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
				<p class="text-xs text-muted-foreground">{m.admin_branding_name_note()}</p>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Languages class="h-4 w-4" />
				{m.admin_branding_tagline()}
			</CardTitle>
			<CardDescription>{m.admin_branding_tagline_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
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
						{:else if isFilled(form.taglines, l)}
							<span class="ml-1 text-[10px] uppercase tracking-wider text-success">·</span>
						{/if}
					</button>
				{/each}
			</div>
			<div class="flex gap-2">
				<Input bind:value={form.taglines[activeLocale]} maxlength={200} placeholder={activeLocale === i18n.defaultLocale ? defaults?.tagline : m.admin_branding_fallback_placeholder({ locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale })} />
				<Button variant="ghost" size="sm" onclick={() => resetTagline(activeLocale)} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_branding_colors()}</CardTitle>
			<CardDescription>Applied as CSS custom properties (<code class="font-mono">--brand-primary</code>, <code class="font-mono">--brand-accent</code>, <code class="font-mono">--brand-success</code>).</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-xs">
				<Label for="primaryHex">{m.admin_branding_primary()}</Label>
				<div class="flex gap-2 items-center">
					<input id="primaryHex" type="color" bind:value={form.primaryHex} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
					<Input bind:value={form.primaryHex} placeholder="#3b82f6" />
					<Button variant="ghost" size="sm" onclick={() => resetField('primaryHex')} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
			<div class="grid gap-2 max-w-xs">
				<Label for="accentHex">{m.admin_branding_accent()}</Label>
				<div class="flex gap-2 items-center">
					<input id="accentHex" type="color" bind:value={form.accentHex} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
					<Input bind:value={form.accentHex} placeholder="#8b5cf6" />
					<Button variant="ghost" size="sm" onclick={() => resetField('accentHex')} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
			<div class="grid gap-2 max-w-xs">
				<Label for="successHex">{m.admin_branding_success()}</Label>
				<div class="flex gap-2 items-center">
					<input id="successHex" type="color" bind:value={form.successHex} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
					<Input bind:value={form.successHex} placeholder="#10b981" />
					<Button variant="ghost" size="sm" onclick={() => resetField('successHex')} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_branding_images()}</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-md">
				<Label for="logo">{m.admin_branding_logo_url()}</Label>
				<div class="flex gap-2">
					<Input id="logo" bind:value={form.logoUrl} placeholder="https://example.com/logo.svg" />
					<Button variant="ghost" size="sm" onclick={() => resetField('logoUrl')} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
				<p class="text-xs text-muted-foreground">{m.admin_branding_logo_note()}</p>
			</div>
			<div class="grid gap-2 max-w-md">
				<Label for="favicon">{m.admin_branding_favicon_url()}</Label>
				<div class="flex gap-2">
					<Input id="favicon" bind:value={form.faviconUrl} placeholder="https://example.com/favicon.ico" />
					<Button variant="ghost" size="sm" onclick={() => resetField('faviconUrl')} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Languages class="h-4 w-4" />
				{m.admin_branding_footer_seo()}
			</CardTitle>
			<CardDescription>{m.admin_branding_footer_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-3">
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
							{:else if isFilled(form.footers, l)}
								<span class="ml-1 text-[10px] uppercase tracking-wider text-success">·</span>
							{/if}
						</button>
					{/each}
				</div>
				<div class="flex gap-2">
					<Input bind:value={form.footers[activeLocale]} maxlength={1000} placeholder={activeLocale === i18n.defaultLocale ? '© 2026 Example Inc.' : m.admin_branding_fallback_placeholder({ locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale })} />
					<Button variant="ghost" size="sm" onclick={() => resetFooter(activeLocale)} aria-label={m.common_reset()}><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>

			<div class="grid gap-2">
				<Label for="analytics">{m.admin_branding_analytics()}</Label>
				<Textarea id="analytics" bind:value={form.analyticsScript} rows={4} placeholder={ANALYTICS_PLACEHOLDER} />
				<p class="text-xs text-muted-foreground">{m.admin_branding_analytics_note()}</p>
			</div>
			<label class="flex items-center gap-3 cursor-pointer select-none">
				<input type="checkbox" bind:checked={form.allowIndexing} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">{m.admin_branding_allow_indexing()}</span>
			</label>
			<p class="text-xs text-muted-foreground -mt-2">{m.admin_branding_indexing_note()}</p>
		</CardContent>
	</Card>

	<div class="flex justify-end">
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? m.common_saving() : m.admin_branding_save_all()}
		</Button>
	</div>
{/if}
