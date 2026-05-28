<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import Languages from '@lucide/svelte/icons/languages'
	import Upload from '@lucide/svelte/icons/upload'
	import Link from '@lucide/svelte/icons/link'
	import Loader2 from '@lucide/svelte/icons/loader-2'
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
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'

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
		primaryHex: '#3b82f6',
		accentHex: '#8b5cf6',
		successHex: '#10b981',
		logoUrl: '',
		faviconUrl: '',
		analyticsScript: '',
		allowIndexing: true,
		taglines: {} as Record<Locale, string>,
		footers: {} as Record<Locale, string>,
	})
	let defaults = $state<Branding | null>(null)
	let loading = $state(true)
	let saving = $state(false)
	let activeLocale = $state<Locale>(i18n.defaultLocale)
	let logoMode = $state<'upload' | 'url'>('upload')
	let faviconMode = $state<'upload' | 'url'>('upload')
	// Snapshot of the last-saved state — used to detect dirty fields so we only
	// PUT what changed (and so the Save button can disable when nothing's dirty).
	let original = $state<FormState | null>(null)
	// Files held client-side until Save is clicked. The preview reads the blob
	// URL, the live branding store stays untouched until the user commits.
	let pendingLogo = $state<{ file: File; objectUrl: string } | null>(null)
	let pendingFavicon = $state<{ file: File; objectUrl: string } | null>(null)
	let uploadingLogo = $state(false)
	let uploadingFavicon = $state(false)

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
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			const res = data as { current: LocalizedBranding; defaults: Branding }
			form = toForm(res.current)
			original = toForm(res.current)
			defaults = res.defaults
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
		if (pendingLogo) URL.revokeObjectURL(pendingLogo.objectUrl)
		if (pendingFavicon) URL.revokeObjectURL(pendingFavicon.objectUrl)
	})

	const hasChanges = $derived.by(() => {
		if (pendingLogo || pendingFavicon) return true
		if (!original) return false
		if (form.name !== original.name) return true
		if (form.primaryHex !== original.primaryHex) return true
		if (form.accentHex !== original.accentHex) return true
		if (form.successHex !== original.successHex) return true
		if (form.logoUrl !== original.logoUrl) return true
		if (form.faviconUrl !== original.faviconUrl) return true
		if (form.analyticsScript !== original.analyticsScript) return true
		if (form.allowIndexing !== original.allowIndexing) return true
		for (const l of i18n.availableLocales) {
			if (form.taglines[l] !== original.taglines[l]) return true
			if (form.footers[l] !== original.footers[l]) return true
		}
		return false
	})

	function edenErrorMsg(error: { value: unknown; status: number }): string {
		return typeof error.value === 'string'
			? error.value
			: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`)
	}

	function stageFile(kind: 'logo' | 'favicon', input: HTMLInputElement) {
		const file = input.files?.[0]
		if (!file) {
			input.value = ''
			return
		}
		const objectUrl = URL.createObjectURL(file)
		if (kind === 'logo') {
			if (pendingLogo) URL.revokeObjectURL(pendingLogo.objectUrl)
			pendingLogo = { file, objectUrl }
		} else {
			if (pendingFavicon) URL.revokeObjectURL(pendingFavicon.objectUrl)
			pendingFavicon = { file, objectUrl }
		}
		input.value = ''
	}

	function clearPending(kind: 'logo' | 'favicon') {
		if (kind === 'logo' && pendingLogo) {
			URL.revokeObjectURL(pendingLogo.objectUrl)
			pendingLogo = null
		} else if (kind === 'favicon' && pendingFavicon) {
			URL.revokeObjectURL(pendingFavicon.objectUrl)
			pendingFavicon = null
		}
	}

	async function save() {
		if (!original || !hasChanges) return
		saving = true
		try {
			// 1. Upload pending files first. Each upload endpoint persists the
			//    matching `branding.*_url` setting server-side, so we sync the
			//    form + original snapshot with the returned URL to keep the
			//    diff below correct.
			if (pendingLogo) {
				uploadingLogo = true
				try {
					const { data, error } = await eden.api.admin.branding.logo.post({ file: pendingLogo.file })
					if (error) throw new Error(edenErrorMsg(error))
					const res = data as { ok: boolean; logoUrl: string }
					form.logoUrl = res.logoUrl
					original.logoUrl = res.logoUrl
					URL.revokeObjectURL(pendingLogo.objectUrl)
					pendingLogo = null
				} finally {
					uploadingLogo = false
				}
			}
			if (pendingFavicon) {
				uploadingFavicon = true
				try {
					const { data, error } = await eden.api.admin.branding.favicon.post({ file: pendingFavicon.file })
					if (error) throw new Error(edenErrorMsg(error))
					const res = data as { ok: boolean; faviconUrl: string }
					form.faviconUrl = res.faviconUrl
					original.faviconUrl = res.faviconUrl
					URL.revokeObjectURL(pendingFavicon.objectUrl)
					pendingFavicon = null
				} finally {
					uploadingFavicon = false
				}
			}

			// 2. PUT only the scalar/translation fields that diverge from the
			//    snapshot. Skip the request entirely if uploads were the only
			//    change — we fetch fresh state below either way.
			const fallback = i18n.defaultLocale
			const body: Record<string, unknown> = {}
			if (form.name !== original.name) body.name = form.name
			if (form.primaryHex !== original.primaryHex) body.primaryHex = form.primaryHex
			if (form.accentHex !== original.accentHex) body.accentHex = form.accentHex
			if (form.successHex !== original.successHex) body.successHex = form.successHex
			if (form.logoUrl !== original.logoUrl) body.logoUrl = form.logoUrl || null
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
			| 'faviconUrl'
			| 'analyticsScript'
			| 'allowIndexing',
	) {
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
			<!-- Logo -->
			<div class="grid gap-2 max-w-md">
				<div class="flex items-center justify-between">
					<Label for="logo">{m.admin_branding_logo_url()}</Label>
					<button
						type="button"
						class="text-xs text-primary hover:underline flex items-center gap-1"
						onclick={() => (logoMode = logoMode === 'upload' ? 'url' : 'upload')}
					>
						{#if logoMode === 'upload'}
							<Link class="h-3 w-3" />
							{m.admin_branding_image_use_url()}
						{:else}
							<Upload class="h-3 w-3" />
							{m.admin_branding_image_use_upload()}
						{/if}
					</button>
				</div>
				{#if pendingLogo}
					<div class="space-y-1">
						<img
							src={pendingLogo.objectUrl}
							alt="Logo preview (pending)"
							class="h-16 w-auto rounded border-2 border-amber-500/60 bg-card object-contain p-2"
						/>
						<p class="text-xs text-amber-600 dark:text-amber-400">{m.admin_branding_image_pending()}</p>
					</div>
				{:else if form.logoUrl}
					<img
						src={form.logoUrl}
						alt="Logo preview"
						class="h-16 w-auto rounded border border-border bg-card object-contain p-2"
					/>
				{/if}
				{#if logoMode === 'upload'}
					<div class="flex gap-2 items-center">
						<input
							id="logo-file"
							type="file"
							accept="image/png,image/jpeg,image/webp,image/svg+xml"
							disabled={saving}
							onchange={(e) => stageFile('logo', e.currentTarget)}
							class="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer hover:file:bg-primary/90 cursor-pointer"
						/>
						{#if pendingLogo}
							<Button variant="ghost" size="sm" onclick={() => clearPending('logo')}>
								{m.admin_branding_image_clear()}
							</Button>
						{/if}
						{#if uploadingLogo}
							<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
							<span class="text-xs text-muted-foreground">{m.admin_branding_image_uploading()}</span>
						{/if}
					</div>
				{:else}
					<div class="flex gap-2">
						<Input id="logo" bind:value={form.logoUrl} placeholder="https://example.com/logo.svg" />
						<Button variant="ghost" size="sm" onclick={() => resetField('logoUrl')} aria-label={m.common_reset()}
							><RotateCcw class="h-3.5 w-3.5" /></Button
						>
					</div>
				{/if}
				<p class="text-xs text-muted-foreground">{m.admin_branding_logo_note()}</p>
			</div>

			<!-- Favicon -->
			<div class="grid gap-2 max-w-md">
				<div class="flex items-center justify-between">
					<Label for="favicon">{m.admin_branding_favicon_url()}</Label>
					<button
						type="button"
						class="text-xs text-primary hover:underline flex items-center gap-1"
						onclick={() => (faviconMode = faviconMode === 'upload' ? 'url' : 'upload')}
					>
						{#if faviconMode === 'upload'}
							<Link class="h-3 w-3" />
							{m.admin_branding_image_use_url()}
						{:else}
							<Upload class="h-3 w-3" />
							{m.admin_branding_image_use_upload()}
						{/if}
					</button>
				</div>
				{#if pendingFavicon}
					<div class="space-y-1">
						<img
							src={pendingFavicon.objectUrl}
							alt="Favicon preview (pending)"
							class="h-10 w-10 rounded border-2 border-amber-500/60 bg-card object-contain p-1"
						/>
						<p class="text-xs text-amber-600 dark:text-amber-400">{m.admin_branding_image_pending()}</p>
					</div>
				{:else if form.faviconUrl}
					<img
						src={form.faviconUrl}
						alt="Favicon preview"
						class="h-10 w-10 rounded border border-border bg-card object-contain p-1"
					/>
				{/if}
				{#if faviconMode === 'upload'}
					<div class="flex gap-2 items-center">
						<input
							id="favicon-file"
							type="file"
							accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
							disabled={saving}
							onchange={(e) => stageFile('favicon', e.currentTarget)}
							class="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer hover:file:bg-primary/90 cursor-pointer"
						/>
						{#if pendingFavicon}
							<Button variant="ghost" size="sm" onclick={() => clearPending('favicon')}>
								{m.admin_branding_image_clear()}
							</Button>
						{/if}
						{#if uploadingFavicon}
							<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
							<span class="text-xs text-muted-foreground">{m.admin_branding_image_uploading()}</span>
						{/if}
					</div>
				{:else}
					<div class="flex gap-2">
						<Input id="favicon" bind:value={form.faviconUrl} placeholder="https://example.com/favicon.ico" />
						<Button variant="ghost" size="sm" onclick={() => resetField('faviconUrl')} aria-label={m.common_reset()}
							><RotateCcw class="h-3.5 w-3.5" /></Button
						>
					</div>
				{/if}
				<p class="text-xs text-muted-foreground">{m.admin_branding_favicon_note()}</p>
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
