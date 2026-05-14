<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Languages from '@lucide/svelte/icons/languages'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Select from '$components/ui/Select.svelte'
	import Label from '$components/ui/Label.svelte'
	import { eden } from '$lib/eden'
	import { i18n as i18nStore, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'

	type I18nConfig = {
		defaultLocale: Locale
		enabledLocales: Locale[]
		availableLocales: Locale[]
	}

	let defaultLocale = $state<Locale>('en')
	let enabled = $state<Record<Locale, boolean>>({} as Record<Locale, boolean>)
	let available = $state<Locale[]>([])
	let loading = $state(true)
	let saving = $state(false)

	onMount(async () => {
		try {
			const { data, error } = await eden.api.admin.i18n.get()
			if (error) throw error
			const cfg = data as I18nConfig
			available = cfg.availableLocales
			defaultLocale = cfg.defaultLocale
			enabled = available.reduce((acc, l) => {
				acc[l] = cfg.enabledLocales.includes(l)
				return acc
			}, {} as Record<Locale, boolean>)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load i18n config')
		} finally {
			loading = false
		}
	})

	const enabledList = $derived(available.filter((l) => enabled[l]))

	async function save() {
		if (enabledList.length === 0) {
			toast.error('At least one locale must be enabled')
			return
		}
		if (!enabledList.includes(defaultLocale)) {
			toast.error('Default locale must be one of the enabled locales')
			return
		}
		saving = true
		try {
			const { error } = await eden.api.admin.i18n.patch({
				defaultLocale,
				enabledLocales: enabledList,
			})
			if (error) {
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			}
			await i18nStore.refresh()
			toast.success('Languages updated')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save')
		} finally {
			saving = false
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Languages</h1>
	<p class="text-sm text-muted-foreground">Pick the default language and toggle which languages users can choose. Disabled languages hide from the public switcher and fall back to the default.</p>
</header>

{#if loading}
	<p class="text-sm text-muted-foreground">Loading…</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Languages class="h-4 w-4" />
				Default language
			</CardTitle>
			<CardDescription>Used for visitors with no saved choice and as a fallback for missing translations.</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="space-y-2 max-w-xs">
				<Label for="default-locale">Default</Label>
				<Select id="default-locale" bind:value={defaultLocale}>
					{#each available as l (l)}
						<option value={l} disabled={!enabled[l]}>{LOCALE_LABELS[l] ?? l}{enabled[l] ? '' : ' (disabled)'}</option>
					{/each}
				</Select>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Enabled languages</CardTitle>
			<CardDescription>Visitors only see languages that are enabled here. Existing translated CMS pages stay in the database — disabling just hides them.</CardDescription>
		</CardHeader>
		<CardContent>
			<ul class="divide-y divide-border">
				{#each available as l (l)}
					<li class="flex items-center justify-between py-2.5">
						<span class="text-sm flex items-center gap-2">
							<span class="font-medium">{LOCALE_LABELS[l] ?? l}</span>
							<span class="text-xs text-muted-foreground font-mono">{l}</span>
						</span>
						<label class="inline-flex items-center gap-2 text-sm cursor-pointer">
							<input
								type="checkbox"
								class="h-4 w-4 rounded border-input"
								bind:checked={enabled[l]}
								disabled={l === defaultLocale}
								aria-label={`Enable ${LOCALE_LABELS[l] ?? l}`}
							/>
							<span class="text-muted-foreground">{enabled[l] ? 'Enabled' : 'Disabled'}</span>
						</label>
					</li>
				{/each}
			</ul>
			<p class="mt-3 text-xs text-muted-foreground">
				The default language can't be disabled — change it above first.
			</p>
		</CardContent>
	</Card>

	<div class="flex justify-end">
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? 'Saving…' : 'Apply'}
		</Button>
	</div>
{/if}
