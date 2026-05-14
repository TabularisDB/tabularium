<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
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

	type FormState = {
		name: string
		tagline: string
		primaryHex: string
		accentHex: string
		successHex: string
		logoUrl: string
		faviconUrl: string
		footerText: string
		analyticsScript: string
		allowIndexing: boolean
	}

	let form = $state<FormState>({
		name: '', tagline: '',
		primaryHex: '#3b82f6', accentHex: '#8b5cf6', successHex: '#10b981',
		logoUrl: '', faviconUrl: '',
		footerText: '', analyticsScript: '',
		allowIndexing: true,
	})
	let defaults = $state<Branding | null>(null)
	let loading = $state(true)
	let saving = $state(false)

	function toForm(b: Branding): FormState {
		return {
			name: b.name,
			tagline: b.tagline,
			primaryHex: b.primaryHex,
			accentHex: b.accentHex,
			successHex: b.successHex,
			logoUrl: b.logoUrl ?? '',
			faviconUrl: b.faviconUrl ?? '',
			footerText: b.footerText ?? '',
			analyticsScript: b.analyticsScript ?? '',
			allowIndexing: b.allowIndexing,
		}
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.branding.get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as { current: Branding; defaults: Branding }
			form = toForm(res.current)
			defaults = res.defaults
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load branding')
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function save() {
		saving = true
		try {
			const body = {
				name: form.name,
				tagline: form.tagline,
				primaryHex: form.primaryHex,
				accentHex: form.accentHex,
				successHex: form.successHex,
				logoUrl: form.logoUrl || null,
				faviconUrl: form.faviconUrl || null,
				footerText: form.footerText || null,
				analyticsScript: form.analyticsScript || null,
				allowIndexing: form.allowIndexing,
			}
			const { data, error } = await eden.api.admin.branding.put(body)
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as { ok: boolean; branding: Branding }
			branding.set(res.branding)
			form = toForm(res.branding)
			toast.success('Branding saved')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save')
		} finally {
			saving = false
		}
	}

	function resetField(key: keyof FormState) {
		if (!defaults) return
		const d = defaults
		const next = { ...form }
		if (key === 'logoUrl') next.logoUrl = d.logoUrl ?? ''
		else if (key === 'faviconUrl') next.faviconUrl = d.faviconUrl ?? ''
		else if (key === 'footerText') next.footerText = d.footerText ?? ''
		else if (key === 'analyticsScript') next.analyticsScript = d.analyticsScript ?? ''
		else if (key === 'allowIndexing') next.allowIndexing = d.allowIndexing
		else if (key === 'name') next.name = d.name
		else if (key === 'tagline') next.tagline = d.tagline
		else if (key === 'primaryHex') next.primaryHex = d.primaryHex
		else if (key === 'accentHex') next.accentHex = d.accentHex
		else if (key === 'successHex') next.successHex = d.successHex
		form = next
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Branding</h1>
	<p class="text-sm text-muted-foreground">Whitelabel name, tagline, colors, logo, footer, analytics. Changes apply instantly.</p>
</header>

{#if loading}
	<p class="text-sm text-muted-foreground">Loading…</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">Identity</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-md">
				<Label for="name">Instance name</Label>
				<div class="flex gap-2">
					<Input id="name" bind:value={form.name} maxlength={60} />
					<Button variant="ghost" size="sm" onclick={() => resetField('name')} aria-label="Reset"><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
			<div class="grid gap-2 max-w-md">
				<Label for="tagline">Tagline</Label>
				<div class="flex gap-2">
					<Input id="tagline" bind:value={form.tagline} maxlength={200} />
					<Button variant="ghost" size="sm" onclick={() => resetField('tagline')} aria-label="Reset"><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Colors</CardTitle>
			<CardDescription>Applied as CSS custom properties (<code class="font-mono">--brand-primary</code>, <code class="font-mono">--brand-accent</code>, <code class="font-mono">--brand-success</code>).</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-xs">
				<Label for="primaryHex">Primary</Label>
				<div class="flex gap-2 items-center">
					<input id="primaryHex" type="color" bind:value={form.primaryHex} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
					<Input bind:value={form.primaryHex} placeholder="#3b82f6" />
					<Button variant="ghost" size="sm" onclick={() => resetField('primaryHex')} aria-label="Reset"><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
			<div class="grid gap-2 max-w-xs">
				<Label for="accentHex">Accent</Label>
				<div class="flex gap-2 items-center">
					<input id="accentHex" type="color" bind:value={form.accentHex} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
					<Input bind:value={form.accentHex} placeholder="#8b5cf6" />
					<Button variant="ghost" size="sm" onclick={() => resetField('accentHex')} aria-label="Reset"><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
			<div class="grid gap-2 max-w-xs">
				<Label for="successHex">Success</Label>
				<div class="flex gap-2 items-center">
					<input id="successHex" type="color" bind:value={form.successHex} class="h-9 w-12 rounded-md border border-input bg-card cursor-pointer" />
					<Input bind:value={form.successHex} placeholder="#10b981" />
					<Button variant="ghost" size="sm" onclick={() => resetField('successHex')} aria-label="Reset"><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Images</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-md">
				<Label for="logo">Logo URL</Label>
				<div class="flex gap-2">
					<Input id="logo" bind:value={form.logoUrl} placeholder="https://example.com/logo.svg" />
					<Button variant="ghost" size="sm" onclick={() => resetField('logoUrl')} aria-label="Reset"><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
				<p class="text-xs text-muted-foreground">SVG or PNG. Renders next to the header name.</p>
			</div>
			<div class="grid gap-2 max-w-md">
				<Label for="favicon">Favicon URL</Label>
				<div class="flex gap-2">
					<Input id="favicon" bind:value={form.faviconUrl} placeholder="https://example.com/favicon.ico" />
					<Button variant="ghost" size="sm" onclick={() => resetField('faviconUrl')} aria-label="Reset"><RotateCcw class="h-3.5 w-3.5" /></Button>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Footer + SEO</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2">
				<Label for="footer">Footer text</Label>
				<Input id="footer" bind:value={form.footerText} maxlength={1000} placeholder="© 2026 Example Inc." />
			</div>
			<div class="grid gap-2">
				<Label for="analytics">Analytics snippet (HTML)</Label>
				<Textarea id="analytics" bind:value={form.analyticsScript} rows={4} placeholder='&lt;script defer data-domain="example.com" src="https://plausible.io/js/script.js">&lt;/script>' />
				<p class="text-xs text-muted-foreground">Injected verbatim into &lt;head&gt;. Only paste trusted snippets (Plausible / Umami).</p>
			</div>
			<label class="flex items-center gap-3 cursor-pointer select-none">
				<input type="checkbox" bind:checked={form.allowIndexing} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">Allow search-engine indexing</span>
			</label>
			<p class="text-xs text-muted-foreground -mt-2">When off: robots.txt returns Disallow and pages get noindex meta.</p>
		</CardContent>
	</Card>

	<div class="flex justify-end">
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? 'Saving…' : 'Save all'}
		</Button>
	</div>
{/if}
