<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import Languages from '@lucide/svelte/icons/languages'
	import Upload from '@lucide/svelte/icons/upload'
	import Link from '@lucide/svelte/icons/link'
	import Loader2 from '@lucide/svelte/icons/loader-2'
	import PaletteIcon from '@lucide/svelte/icons/palette'
	import Check from '@lucide/svelte/icons/check'
	import AppWindow from '@lucide/svelte/icons/app-window'
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
	import { branding, LOGO_STYLES, THEMES, type Branding, type LogoStyle, type Theme } from '$lib/stores/branding.svelte'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'
	import { SOCIAL_ICON_PATHS, SOCIAL_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from '$lib/social'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'

	type LocalizedBranding = Branding & {
		taglineTranslations: Partial<Record<Locale, string>>
		footerTextTranslations: Partial<Record<Locale, string>>
	}

	type Palette = Pick<Branding, 'primaryHex' | 'accentHex' | 'successHex'>
	type FormState = {
		name: string
		theme: Theme
		primaryHex: string
		accentHex: string
		successHex: string
		logoUrl: string
		logoLightUrl: string
		logoStyle: LogoStyle
		faviconUrl: string
		analyticsScript: string
		allowIndexing: boolean
		taglines: Record<Locale, string>
		footers: Record<Locale, string>
		socials: Record<SocialPlatform, string>
		app: Record<AppField, string>
	}

	const APP_FIELDS = ['name', 'url', 'downloadUrl', 'videoUrl', 'videoPosterUrl'] as const
	type AppField = (typeof APP_FIELDS)[number]

	function emptyApp(): Record<AppField, string> {
		return Object.fromEntries(APP_FIELDS.map((f) => [f, ''])) as Record<AppField, string>
	}

	function emptySocials(): Record<SocialPlatform, string> {
		return Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, ''])) as Record<SocialPlatform, string>
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

	let form = $state<FormState>({
		name: '',
		theme: 'default',
		primaryHex: '#3b82f6',
		accentHex: '#8b5cf6',
		successHex: '#10b981',
		logoUrl: '',
		logoLightUrl: '',
		logoStyle: 'mark',
		faviconUrl: '',
		analyticsScript: '',
		allowIndexing: true,
		taglines: {} as Record<Locale, string>,
		footers: {} as Record<Locale, string>,
		socials: emptySocials(),
		app: emptyApp(),
	})
	let defaults = $state<Branding | null>(null)
	let themePalettes = $state<Record<Theme, Palette> | null>(null)
	let loading = $state(true)
	let saving = $state(false)
	let activeLocale = $state<Locale>(i18n.defaultLocale)
	type ImageKind = 'logo' | 'logoLight' | 'favicon'
	const IMAGE_KINDS: ImageKind[] = ['logo', 'logoLight', 'favicon']
	const IMAGE_FIELDS = { logo: 'logoUrl', logoLight: 'logoLightUrl', favicon: 'faviconUrl' } as const
	let imageMode = $state<Record<ImageKind, 'upload' | 'url'>>({
		logo: 'upload',
		logoLight: 'upload',
		favicon: 'upload',
	})
	// Snapshot of the last-saved state — used to detect dirty fields so we only
	// PUT what changed (and so the Save button can disable when nothing's dirty).
	let original = $state<FormState | null>(null)
	// Files held client-side until Save is clicked. The preview reads the blob
	// URL, the live branding store stays untouched until the user commits.
	let pending = $state<Record<ImageKind, { file: File; objectUrl: string } | null>>({
		logo: null,
		logoLight: null,
		favicon: null,
	})
	let uploading = $state<ImageKind | null>(null)

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
			theme: b.theme,
			primaryHex: b.primaryHex,
			accentHex: b.accentHex,
			successHex: b.successHex,
			logoUrl: b.logoUrl ?? '',
			logoLightUrl: b.logoLightUrl ?? '',
			logoStyle: b.logoStyle,
			faviconUrl: b.faviconUrl ?? '',
			analyticsScript: b.analyticsScript ?? '',
			allowIndexing: b.allowIndexing,
			taglines,
			footers,
			socials: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, b.socialLinks?.[p] ?? ''])) as Record<
				SocialPlatform,
				string
			>,
			app: Object.fromEntries(APP_FIELDS.map((f) => [f, b.companionApp?.[f] ?? ''])) as Record<AppField, string>,
		}
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.branding.get()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			const res = data as { current: LocalizedBranding; defaults: Branding; themePalettes: Record<Theme, Palette> }
			form = toForm(res.current)
			original = toForm(res.current)
			defaults = res.defaults
			themePalettes = res.themePalettes
			activeLocale = i18n.defaultLocale
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_branding_load_failed())
		} finally {
			loading = false
		}
	}

	onMount(load)

	// Revoke any in-flight blob URLs when leaving the page.
	onDestroy(() => {
		for (const kind of IMAGE_KINDS) if (pending[kind]) URL.revokeObjectURL(pending[kind].objectUrl)
	})

	const hasChanges = $derived.by(() => {
		if (IMAGE_KINDS.some((kind) => pending[kind])) return true
		if (!original) return false
		if (form.name !== original.name) return true
		if (form.theme !== original.theme) return true
		if (form.primaryHex !== original.primaryHex) return true
		if (form.accentHex !== original.accentHex) return true
		if (form.successHex !== original.successHex) return true
		if (form.logoUrl !== original.logoUrl) return true
		if (form.logoLightUrl !== original.logoLightUrl) return true
		if (form.logoStyle !== original.logoStyle) return true
		if (form.faviconUrl !== original.faviconUrl) return true
		if (form.analyticsScript !== original.analyticsScript) return true
		if (form.allowIndexing !== original.allowIndexing) return true
		for (const l of i18n.availableLocales) {
			if (form.taglines[l] !== original.taglines[l]) return true
			if (form.footers[l] !== original.footers[l]) return true
		}
		if (SOCIAL_PLATFORMS.some((p) => form.socials[p] !== original?.socials[p])) return true
		if (APP_FIELDS.some((f) => form.app[f] !== original?.app[f])) return true
		return false
	})

	function edenErrorMsg(error: { value: unknown; status: number }): string {
		return typeof error.value === 'string'
			? error.value
			: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`)
	}

	function stageFile(kind: ImageKind, input: HTMLInputElement) {
		const file = input.files?.[0]
		if (!file) {
			input.value = ''
			return
		}
		clearPending(kind)
		pending[kind] = { file, objectUrl: URL.createObjectURL(file) }
		input.value = ''
	}

	function clearPending(kind: ImageKind) {
		const staged = pending[kind]
		if (!staged) return
		URL.revokeObjectURL(staged.objectUrl)
		pending[kind] = null
	}

	async function uploadImage(kind: ImageKind, file: File): Promise<string> {
		if (kind === 'favicon') {
			const { data, error } = await eden.api.admin.branding.favicon.post({ file })
			if (error) throw new Error(edenErrorMsg(error))
			return (data as { faviconUrl: string }).faviconUrl
		}
		const { data, error } = await eden.api.admin.branding.logo.post(
			{ file },
			kind === 'logoLight' ? { query: { variant: 'light' } } : undefined,
		)
		if (error) throw new Error(edenErrorMsg(error))
		return (data as { logoUrl: string }).logoUrl
	}

	async function save() {
		if (!original || !hasChanges) return
		saving = true
		try {
			// 1. Upload pending files first. Each upload endpoint persists the
			//    matching `branding.*_url` setting server-side, so we sync the
			//    form + original snapshot with the returned URL to keep the
			//    diff below correct.
			for (const kind of IMAGE_KINDS) {
				const staged = pending[kind]
				if (!staged) continue
				uploading = kind
				try {
					const url = await uploadImage(kind, staged.file)
					form[IMAGE_FIELDS[kind]] = url
					original[IMAGE_FIELDS[kind]] = url
					clearPending(kind)
				} finally {
					uploading = null
				}
			}

			// 2. PUT only the scalar/translation fields that diverge from the
			//    snapshot. Skip the request entirely if uploads were the only
			//    change — we fetch fresh state below either way.
			const fallback = i18n.defaultLocale
			const body: Record<string, unknown> = {}
			if (form.name !== original.name) body.name = form.name
			if (form.theme !== original.theme) body.theme = form.theme
			if (form.primaryHex !== original.primaryHex) body.primaryHex = form.primaryHex
			if (form.accentHex !== original.accentHex) body.accentHex = form.accentHex
			if (form.successHex !== original.successHex) body.successHex = form.successHex
			if (form.logoUrl !== original.logoUrl) body.logoUrl = form.logoUrl || null
			if (form.logoLightUrl !== original.logoLightUrl) body.logoLightUrl = form.logoLightUrl || null
			if (form.logoStyle !== original.logoStyle) body.logoStyle = form.logoStyle
			if (form.faviconUrl !== original.faviconUrl) body.faviconUrl = form.faviconUrl || null
			if (form.analyticsScript !== original.analyticsScript) body.analyticsScript = form.analyticsScript || null
			if (form.allowIndexing !== original.allowIndexing) body.allowIndexing = form.allowIndexing
			if (form.taglines[fallback] !== original.taglines[fallback]) body.tagline = form.taglines[fallback] ?? ''
			if (form.footers[fallback] !== original.footers[fallback]) body.footerText = form.footers[fallback] || null

			const taglineDiff: Partial<Record<Locale, string | null>> = {}
			const footerDiff: Partial<Record<Locale, string | null>> = {}
			let taglineChanged = false
			let footerChanged = false
			for (const l of i18n.availableLocales) {
				if (form.taglines[l] !== original.taglines[l]) {
					taglineDiff[l] = form.taglines[l]?.trim() ? form.taglines[l] : null
					taglineChanged = true
				}
				if (form.footers[l] !== original.footers[l]) {
					footerDiff[l] = form.footers[l]?.trim() ? form.footers[l] : null
					footerChanged = true
				}
			}
			const socialDiff: Partial<Record<SocialPlatform, string | null>> = {}
			for (const p of SOCIAL_PLATFORMS) {
				if (form.socials[p] !== original.socials[p]) socialDiff[p] = form.socials[p].trim() || null
			}
			if (Object.keys(socialDiff).length > 0) body.socialLinks = socialDiff
			const appDiff: Partial<Record<AppField, string | null>> = {}
			for (const f of APP_FIELDS) {
				if (form.app[f] !== original.app[f]) appDiff[f] = form.app[f].trim() || null
			}
			if (Object.keys(appDiff).length > 0) body.companionApp = appDiff
			if (taglineChanged) body.taglineTranslations = taglineDiff
			if (footerChanged) body.footerTextTranslations = footerDiff

			let updated: LocalizedBranding
			if (Object.keys(body).length > 0) {
				const { data, error } = await eden.api.admin.branding.put(body)
				if (error) throw new Error(edenErrorMsg(error))
				updated = (data as { ok: boolean; branding: LocalizedBranding }).branding
			} else {
				// Only file uploads happened — reload to get the canonical state.
				const { data, error } = await eden.api.admin.branding.get()
				if (error) throw new Error(edenErrorMsg(error))
				updated = (data as { current: LocalizedBranding; defaults: Branding }).current
			}

			branding.set(updated)
			form = toForm(updated)
			original = toForm(updated)
			toast.success(m.admin_branding_saved())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_branding_save_failed())
		} finally {
			saving = false
		}
	}

	function resetField(
		key:
			| 'name'
			| 'primaryHex'
			| 'accentHex'
			| 'successHex'
			| 'logoUrl'
			| 'logoLightUrl'
			| 'faviconUrl'
			| 'analyticsScript'
			| 'allowIndexing',
	) {
		if (!defaults) return
		const d = defaults
		const palette = themePalettes?.[form.theme] ?? d
		if (key === 'name') form.name = d.name
		else if (key === 'primaryHex') form.primaryHex = palette.primaryHex
		else if (key === 'accentHex') form.accentHex = palette.accentHex
		else if (key === 'successHex') form.successHex = palette.successHex
		else if (key === 'logoUrl') form.logoUrl = d.logoUrl ?? ''
		else if (key === 'logoLightUrl') form.logoLightUrl = d.logoLightUrl ?? ''
		else if (key === 'faviconUrl') form.faviconUrl = d.faviconUrl ?? ''
		else if (key === 'analyticsScript') form.analyticsScript = d.analyticsScript ?? ''
		else if (key === 'allowIndexing') form.allowIndexing = d.allowIndexing
	}

	// Switching theme carries over any colour the admin customised, but swaps
	// the ones still on the previous theme's palette for the new theme's.
	function selectTheme(next: Theme) {
		const previous = themePalettes?.[form.theme]
		const target = themePalettes?.[next]
		form.theme = next
		if (!previous || !target) return
		for (const key of ['primaryHex', 'accentHex', 'successHex'] as const) {
			if (form[key].toLowerCase() === previous[key].toLowerCase()) form[key] = target[key]
		}
	}

	const THEME_LABELS: Record<Theme, { title: () => string; description: () => string }> = {
		default: { title: m.admin_branding_theme_default, description: m.admin_branding_theme_default_desc },
		tabularis: { title: m.admin_branding_theme_tabularis, description: m.admin_branding_theme_tabularis_desc },
	}

	// Static swatches (background / surface / primary / accent) for the picker.
	const THEME_SWATCHES: Record<Theme, string[]> = {
		default: ['#08090a', '#111214', '#3b82f6', '#8b5cf6'],
		tabularis: ['#030712', '#11121c', '#2563eb', '#35d0c0'],
	}

	const LOGO_STYLE_LABELS: Record<LogoStyle, { title: () => string; description: () => string }> = {
		mark: { title: m.admin_branding_logo_style_mark, description: m.admin_branding_logo_style_mark_desc },
		wordmark: { title: m.admin_branding_logo_style_wordmark, description: m.admin_branding_logo_style_wordmark_desc },
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

<AdminPageHeader title={m.admin_branding_title()} subtitle={m.admin_branding_subtitle()} />

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
					<Button variant="ghost" size="sm" onclick={() => resetField('name')} aria-label={m.common_reset()}
						><RotateCcw class="h-3.5 w-3.5" /></Button
					>
				</div>
				<p class="text-xs text-muted-foreground">{m.admin_branding_name_note()}</p>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<PaletteIcon class="h-4 w-4" />
				{m.admin_branding_theme()}
			</CardTitle>
			<CardDescription>{m.admin_branding_theme_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={m.admin_branding_theme()}>
				{#each THEMES as t (t)}
					<button
						type="button"
						role="radio"
						aria-checked={form.theme === t}
						class={[
							'flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors',
							form.theme === t ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50',
						].join(' ')}
						onclick={() => selectTheme(t)}
					>
						<span class="flex gap-1.5">
							{#each THEME_SWATCHES[t] as color (color)}
								<span class="h-5 w-5 rounded-full border border-border" style:background-color={color}></span>
							{/each}
						</span>
						<span class="space-y-1">
							<span class="flex items-center gap-2 text-sm font-medium">
								{THEME_LABELS[t].title()}
								{#if form.theme === t}<Check class="h-3.5 w-3.5 text-primary" />{/if}
							</span>
							<span class="block text-xs text-muted-foreground">{THEME_LABELS[t].description()}</span>
						</span>
					</button>
				{/each}
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
						class={[
							'rounded-md border px-2.5 py-1 text-xs transition-colors',
							activeLocale === l
								? 'border-primary text-foreground bg-primary/10'
								: 'border-border text-muted-foreground hover:bg-accent/50',
						].join(' ')}
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
				<Input
					bind:value={form.taglines[activeLocale]}
					maxlength={200}
					placeholder={activeLocale === i18n.defaultLocale
						? defaults?.tagline
						: m.admin_branding_fallback_placeholder({
								locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
							})}
				/>
				<Button variant="ghost" size="sm" onclick={() => resetTagline(activeLocale)} aria-label={m.common_reset()}
					><RotateCcw class="h-3.5 w-3.5" /></Button
				>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_branding_colors()}</CardTitle>
			<CardDescription
				>Applied as CSS custom properties (<code class="font-mono">--brand-primary</code>,
				<code class="font-mono">--brand-accent</code>, <code class="font-mono">--brand-success</code>).</CardDescription
			>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-xs">
				<Label for="primaryHex">{m.admin_branding_primary()}</Label>
				<div class="flex gap-2 items-center">
					<input
						id="primaryHex"
						type="color"
						bind:value={form.primaryHex}
						class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer"
					/>
					<Input bind:value={form.primaryHex} placeholder="#3b82f6" />
					<Button variant="ghost" size="sm" onclick={() => resetField('primaryHex')} aria-label={m.common_reset()}
						><RotateCcw class="h-3.5 w-3.5" /></Button
					>
				</div>
			</div>
			<div class="grid gap-2 max-w-xs">
				<Label for="accentHex">{m.admin_branding_accent()}</Label>
				<div class="flex gap-2 items-center">
					<input
						id="accentHex"
						type="color"
						bind:value={form.accentHex}
						class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer"
					/>
					<Input bind:value={form.accentHex} placeholder="#8b5cf6" />
					<Button variant="ghost" size="sm" onclick={() => resetField('accentHex')} aria-label={m.common_reset()}
						><RotateCcw class="h-3.5 w-3.5" /></Button
					>
				</div>
			</div>
			<div class="grid gap-2 max-w-xs">
				<Label for="successHex">{m.admin_branding_success()}</Label>
				<div class="flex gap-2 items-center">
					<input
						id="successHex"
						type="color"
						bind:value={form.successHex}
						class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer"
					/>
					<Input bind:value={form.successHex} placeholder="#10b981" />
					<Button variant="ghost" size="sm" onclick={() => resetField('successHex')} aria-label={m.common_reset()}
						><RotateCcw class="h-3.5 w-3.5" /></Button
					>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_branding_images()}</CardTitle>
		</CardHeader>
		<CardContent class="space-y-6">
			<div class="grid gap-2">
				<Label>{m.admin_branding_logo_style()}</Label>
				<div class="grid gap-3 sm:grid-cols-2 max-w-2xl" role="radiogroup" aria-label={m.admin_branding_logo_style()}>
					{#each LOGO_STYLES as style (style)}
						<button
							type="button"
							role="radio"
							aria-checked={form.logoStyle === style}
							class={[
								'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
								form.logoStyle === style ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50',
							].join(' ')}
							onclick={() => (form.logoStyle = style)}
						>
							<span class="flex items-center gap-2 text-sm font-medium">
								{LOGO_STYLE_LABELS[style].title()}
								{#if form.logoStyle === style}<Check class="h-3.5 w-3.5 text-primary" />{/if}
							</span>
							<span class="text-xs text-muted-foreground">{LOGO_STYLE_LABELS[style].description()}</span>
						</button>
					{/each}
				</div>
			</div>

			{@render imageField('logo', {
				label: m.admin_branding_logo_url(),
				note: m.admin_branding_logo_note(),
				accept: 'image/png,image/jpeg,image/webp,image/svg+xml',
				placeholder: 'https://example.com/logo.svg',
				preview: 'h-16 w-auto p-2',
			})}

			{@render imageField('logoLight', {
				label: m.admin_branding_logo_light_url(),
				note: m.admin_branding_logo_light_note(),
				accept: 'image/png,image/jpeg,image/webp,image/svg+xml',
				placeholder: 'https://example.com/logo-dark-text.svg',
				preview: 'h-16 w-auto p-2 bg-white',
			})}

			{@render imageField('favicon', {
				label: m.admin_branding_favicon_url(),
				note: m.admin_branding_favicon_note(),
				accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico',
				placeholder: 'https://example.com/favicon.ico',
				preview: 'h-10 w-10 p-1',
			})}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_branding_social()}</CardTitle>
			<CardDescription>{m.admin_branding_social_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-4 sm:grid-cols-2">
			{#each SOCIAL_PLATFORMS as platform (platform)}
				<div class="grid gap-2">
					<Label for={`social-${platform}`} class="flex items-center gap-2">
						<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"
							><path d={SOCIAL_ICON_PATHS[platform]} /></svg
						>
						{SOCIAL_LABELS[platform]}
					</Label>
					<Input id={`social-${platform}`} type="url" bind:value={form.socials[platform]} placeholder={`https://…`} />
				</div>
			{/each}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<AppWindow class="h-4 w-4" />
				{m.admin_branding_app()}
			</CardTitle>
			<CardDescription>{m.admin_branding_app_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-4 sm:grid-cols-2">
			<div class="grid gap-2">
				<Label for="app-name">{m.admin_branding_app_name()}</Label>
				<Input id="app-name" bind:value={form.app.name} maxlength={60} placeholder="Tabularis" />
			</div>
			<div class="grid gap-2">
				<Label for="app-url">{m.admin_branding_app_url()}</Label>
				<Input id="app-url" type="url" bind:value={form.app.url} placeholder="https://…" />
			</div>
			<div class="grid gap-2">
				<Label for="app-download">{m.admin_branding_app_download()}</Label>
				<Input id="app-download" type="url" bind:value={form.app.downloadUrl} placeholder="https://…/download" />
			</div>
			<div class="grid gap-2">
				<Label for="app-video">{m.admin_branding_app_video()}</Label>
				<Input id="app-video" type="url" bind:value={form.app.videoUrl} placeholder="https://…/demo.mp4" />
			</div>
			<div class="grid gap-2 sm:col-span-2">
				<Label for="app-poster">{m.admin_branding_app_poster()}</Label>
				<Input id="app-poster" type="url" bind:value={form.app.videoPosterUrl} placeholder="https://…/demo.jpg" />
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
							class={[
								'rounded-md border px-2.5 py-1 text-xs transition-colors',
								activeLocale === l
									? 'border-primary text-foreground bg-primary/10'
									: 'border-border text-muted-foreground hover:bg-accent/50',
							].join(' ')}
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
					<Input
						bind:value={form.footers[activeLocale]}
						maxlength={1000}
						placeholder={activeLocale === i18n.defaultLocale
							? '© 2026 Example Inc.'
							: m.admin_branding_fallback_placeholder({
									locale: LOCALE_LABELS[i18n.defaultLocale] ?? i18n.defaultLocale,
								})}
					/>
					<Button variant="ghost" size="sm" onclick={() => resetFooter(activeLocale)} aria-label={m.common_reset()}
						><RotateCcw class="h-3.5 w-3.5" /></Button
					>
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

	<div class="flex justify-end items-center gap-3">
		{#if !hasChanges && !saving}
			<span class="text-xs text-muted-foreground">{m.admin_branding_no_changes()}</span>
		{/if}
		<Button size="sm" onclick={save} disabled={saving || !hasChanges}>
			<Save class="h-3.5 w-3.5" />
			{saving ? m.common_saving() : m.admin_branding_save_all()}
		</Button>
	</div>
{/if}

{#snippet imageField(
	kind: ImageKind,
	opts: { label: string; note: string; accept: string; placeholder: string; preview: string },
)}
	{@const field = IMAGE_FIELDS[kind]}
	{@const staged = pending[kind]}
	<div class="grid gap-2 max-w-md">
		<div class="flex items-center justify-between">
			<Label for={`${kind}-input`}>{opts.label}</Label>
			<button
				type="button"
				class="text-xs text-primary hover:underline flex items-center gap-1"
				onclick={() => (imageMode[kind] = imageMode[kind] === 'upload' ? 'url' : 'upload')}
			>
				{#if imageMode[kind] === 'upload'}
					<Link class="h-3 w-3" />
					{m.admin_branding_image_use_url()}
				{:else}
					<Upload class="h-3 w-3" />
					{m.admin_branding_image_use_upload()}
				{/if}
			</button>
		</div>
		{#if staged}
			<div class="space-y-1">
				<img
					src={staged.objectUrl}
					alt={`${opts.label} (pending)`}
					class={`rounded border-2 border-amber-500/60 bg-card object-contain ${opts.preview}`}
				/>
				<p class="text-xs text-amber-600 dark:text-amber-400">{m.admin_branding_image_pending()}</p>
			</div>
		{:else if form[field]}
			<img
				src={form[field]}
				alt={opts.label}
				class={`rounded border border-border bg-card object-contain ${opts.preview}`}
			/>
		{/if}
		{#if imageMode[kind] === 'upload'}
			<div class="flex gap-2 items-center">
				<input
					id={`${kind}-input`}
					type="file"
					accept={opts.accept}
					disabled={saving}
					onchange={(e) => stageFile(kind, e.currentTarget)}
					class="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer hover:file:bg-primary/90 cursor-pointer"
				/>
				{#if staged}
					<Button variant="ghost" size="sm" onclick={() => clearPending(kind)}>
						{m.admin_branding_image_clear()}
					</Button>
				{/if}
				{#if uploading === kind}
					<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
					<span class="text-xs text-muted-foreground">{m.admin_branding_image_uploading()}</span>
				{/if}
			</div>
		{:else}
			<div class="flex gap-2">
				<Input id={`${kind}-input`} bind:value={form[field]} placeholder={opts.placeholder} />
				<Button variant="ghost" size="sm" onclick={() => resetField(field)} aria-label={m.common_reset()}
					><RotateCcw class="h-3.5 w-3.5" /></Button
				>
			</div>
		{/if}
		<p class="text-xs text-muted-foreground">{opts.note}</p>
	</div>
{/snippet}
