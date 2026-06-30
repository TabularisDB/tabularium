<script lang="ts">
	import { toast } from 'svelte-sonner'
	import { BarChart } from 'layerchart'
	import Check from '@lucide/svelte/icons/check'
	import AlertCircle from '@lucide/svelte/icons/alert-circle'
	import ArrowLeft from '@lucide/svelte/icons/arrow-left'
	import Mail from '@lucide/svelte/icons/mail'
	import Eye from '@lucide/svelte/icons/eye'
	import EyeOff from '@lucide/svelte/icons/eye-off'
	import Save from '@lucide/svelte/icons/save'
	import Zap from '@lucide/svelte/icons/zap'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import ShieldOff from '@lucide/svelte/icons/shield-off'
	import { m } from '$lib/paraglide/messages'
	import { eden } from '$lib/eden'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import type {
		EmailSettings,
		TurboStats,
		TurboConsumerKey,
	} from './TurboSettings.load'

	type Props = {
		data: {
			settings: EmailSettings
			stats: TurboStats | null
			statsError: string | null
			consumerKeys: TurboConsumerKey[] | null
			consumerKeysError: string | null
			suppressionCount: number | null
		}
	}
	let { data }: Props = $props()
	let suppressionCount = $state<number | null>(data.suppressionCount)
	let syncing = $state(false)

	// svelte-ignore state_referenced_locally
	let settings = $state<EmailSettings>(data.settings)
	let apiKey = $state('')
	let consumerKey = $state(settings.turbo.consumerKey ?? '')
	let consumerSecret = $state('')
	let region = $state<'global' | 'eu'>(settings.turbo.region ?? 'global')
	let revealApiKey = $state(false)
	let revealConsumerSecret = $state(false)
	let busy = $state(false)
	let lastTest = $state<{ ok: boolean; reason?: string; at: number } | null>(null)

	type WizardMethod = 'bootstrap' | 'manual'
	let wizardDismissed = $state(false)
	let wizardStep = $state<1 | 2 | 3>(1)
	let wizardMethod = $state<WizardMethod | null>(null)
	let wizardBootstrap = $state({ email: '', password: '' })
	let wizardTestTo = $state('')
	const wizardActive = $derived(!settings.turbo.apiKeySet && !wizardDismissed)

	const isConfigured = $derived(
		settings.turbo.apiKeySet &&
			Boolean(settings.turbo.consumerKey) &&
			settings.turbo.consumerSecretSet,
	)
	const isPartial = $derived(
		!isConfigured && (settings.turbo.apiKeySet || Boolean(settings.turbo.consumerKey)),
	)
	const isActive = $derived(settings.provider === 'turbo')
	const missingCreds = $derived.by(() => {
		const out: string[] = []
		if (!settings.turbo.apiKeySet) out.push('API key')
		if (!settings.turbo.consumerKey) out.push('Consumer key')
		if (!settings.turbo.consumerSecretSet) out.push('Consumer secret')
		return out
	})

	type HeroTone = 'success' | 'warning' | 'info' | 'neutral'
	type Hero = {
		tone: HeroTone
		title: string
		body: string
		actionLabel: string | null
		action: (() => void | Promise<void>) | null
		secondaryLabel?: string
		secondary?: () => void | Promise<void>
	}

	function scrollToCreds() {
		const el = document.getElementById('turbosmtp-creds-card')
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}

	async function setActiveProvider() {
		busy = true
		try {
			const { error } = await eden.api.admin.email.put({
				provider: 'turbo',
				from: settings.from,
			})
			if (error) {
				toast.error(edenErr(error))
				return
			}
			toast.success('TurboSMTP is now the active provider')
			await refreshSettings()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not activate provider')
		} finally {
			busy = false
		}
	}

	const hero = $derived.by<Hero>(() => {
		if (!isConfigured) {
			if (missingCreds.length === 3) {
				return {
					tone: 'info',
					title: m.turbosmtp_hero_fresh_title(),
					body: m.turbosmtp_hero_fresh_body(),
					actionLabel: m.turbosmtp_hero_start_wizard(),
					action: () => {
						wizardDismissed = false
						wizardStep = 1
					},
					secondaryLabel: m.turbosmtp_hero_skip_to_form(),
					secondary: () => {
						wizardDismissed = true
						scrollToCreds()
					},
				}
			}
			return {
				tone: 'warning',
				title: m.turbosmtp_hero_partial_title(),
				body: m.turbosmtp_hero_partial_body({ missing: missingCreds.join(', ') }),
				actionLabel: m.turbosmtp_hero_finish_credentials(),
				action: scrollToCreds,
				secondaryLabel: wizardActive ? undefined : m.turbosmtp_hero_reopen_wizard(),
				secondary: wizardActive
					? undefined
					: () => {
							wizardDismissed = false
							wizardStep = settings.turbo.apiKeySet ? 3 : 1
						},
			}
		}
		if (!isActive) {
			return {
				tone: 'info',
				title: m.turbosmtp_hero_inactive_title(),
				body: m.turbosmtp_hero_inactive_body(),
				actionLabel: m.turbosmtp_hero_set_active(),
				action: setActiveProvider,
				secondaryLabel: m.turbosmtp_hero_test_connection(),
				secondary: testConnection,
			}
		}
		return {
			tone: 'success',
			title: m.turbosmtp_hero_live_title(),
			body: m.turbosmtp_hero_live_body(),
			actionLabel: m.turbosmtp_hero_send_test(),
			action: () => {
				wizardDismissed = false
				wizardStep = 3
			},
			secondaryLabel: m.turbosmtp_hero_test_connection(),
			secondary: testConnection,
		}
	})

	// Debounced field-level validation. Hints, not gates — saving still goes
	// through; the server validates again on PUT.
	let consumerKeyError = $state('')
	let consumerKeyTimer: ReturnType<typeof setTimeout> | null = null
	function onConsumerKeyInput() {
		if (consumerKeyTimer) clearTimeout(consumerKeyTimer)
		consumerKeyTimer = setTimeout(() => {
			const v = consumerKey.trim()
			if (!v) consumerKeyError = ''
			else if (v.length < 8) consumerKeyError = 'Consumer keys are usually 20+ chars'
			else if (/\s/.test(v)) consumerKeyError = 'No spaces allowed'
			else consumerKeyError = ''
		}, 250)
	}

	function fmtPct(n: number): string {
		return `${(n * 100).toFixed(1)}%`
	}

	function edenErr(error: { status: number; value: unknown } | null | undefined): string {
		if (!error) return 'Request failed'
		const v = error.value
		if (typeof v === 'string') return v
		if (v && typeof v === 'object' && 'error' in v && typeof (v as { error?: unknown }).error === 'string') {
			return (v as { error: string }).error
		}
		return `Request failed (${error.status})`
	}

	async function refreshSettings() {
		const { data, error } = await eden.api.admin.email.get()
		if (error) return
		const next = data as EmailSettings
		settings = next
		consumerKey = next.turbo.consumerKey ?? ''
		region = next.turbo.region ?? 'global'
		apiKey = ''
		consumerSecret = ''
	}

	async function saveCredentials() {
		busy = true
		const turbo: {
			region: 'global' | 'eu'
			consumerKey?: string
			apiKey?: string
			consumerSecret?: string
		} = { region, consumerKey: consumerKey.trim() }
		if (apiKey) turbo.apiKey = apiKey
		if (consumerSecret) turbo.consumerSecret = consumerSecret
		try {
			const { error } = await eden.api.admin.email.put({
				provider: 'turbo',
				from: settings.from,
				turbo,
			})
			if (error) {
				toast.error(edenErr(error))
				return
			}
			toast.success('TurboSMTP credentials saved')
			await refreshSettings()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed')
		} finally {
			busy = false
		}
	}

	async function runBootstrap() {
		if (!wizardBootstrap.email || !wizardBootstrap.password) {
			toast.error('TurboSMTP account email and password are required')
			return
		}
		busy = true
		try {
			const { data, error } = await eden.api.admin.email.bootstrap.post({
				email: wizardBootstrap.email,
				password: wizardBootstrap.password,
				region,
			})
			if (error) {
				toast.error(edenErr(error))
				return
			}
			const body = data as { ok: true; consumerKeyLabel: string; testMid: string }
			wizardBootstrap.password = ''
			toast.success(`Bootstrapped (test mid: ${body.testMid})`)
			await refreshSettings()
			wizardStep = 3
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Bootstrap failed')
		} finally {
			busy = false
		}
	}

	async function sendWizardTest() {
		if (!wizardTestTo) {
			toast.error('Recipient required')
			return
		}
		busy = true
		try {
			const { error } = await eden.api.admin.email.test.post({
				to: wizardTestTo,
				locale: 'en',
			})
			if (error) {
				toast.error(edenErr(error))
				return
			}
			toast.success('Test mail sent — check your inbox')
			wizardDismissed = true
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Send failed')
		} finally {
			busy = false
		}
	}

	async function refreshSuppressionCount() {
		const { data, error } = await eden.api.admin.email.suppression.get({
			query: { limit: '1' },
		})
		if (error) return
		const body = data as { total: number }
		suppressionCount = body.total
	}

	async function syncSuppression() {
		syncing = true
		try {
			const { data, error } = await eden.api.admin.email.suppression.sync.post()
			if (error) {
				toast.error(edenErr(error))
				return
			}
			const body = data as { added: number; checked: number }
			toast.success(`Suppression sync — added ${body.added} of ${body.checked}`)
			await refreshSuppressionCount()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Sync failed')
		} finally {
			syncing = false
		}
	}

	function shortHour(iso: string): string {
		// "2026-06-11T13:00:00Z" → "13:00"
		const t = iso.split('T')[1] ?? ''
		return t.slice(0, 5)
	}

	const hourlyChartData = $derived(
		data.stats
			? data.stats.hourly.map((h) => ({ hour: shortHour(h.hour), sent: h.sent, delivered: h.delivered, failed: h.failed }))
			: [],
	)

	async function testConnection() {
		busy = true
		try {
			const { data, error } = await eden.api.admin.email.turbosmtp['test-connection'].post()
			if (error) {
				const msg = edenErr(error)
				lastTest = { ok: false, reason: msg, at: Date.now() }
				toast.error(msg)
				return
			}
			const body = data as { ok: boolean; reason?: string }
			lastTest = { ok: body.ok, reason: body.reason, at: Date.now() }
			if (body.ok) toast.success('TurboSMTP connection OK')
			else toast.error(`TurboSMTP test failed: ${body.reason ?? 'unknown'}`)
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Test failed'
			lastTest = { ok: false, reason: msg, at: Date.now() }
			toast.error(msg)
		} finally {
			busy = false
		}
	}
</script>

<AdminPageHeader title={m.turbosmtp_title()} subtitle={m.turbosmtp_subtitle()}>
	{#snippet actions()}
		<Button variant="ghost" size="sm" href="/admin/email">
			<ArrowLeft class="h-3.5 w-3.5" />
			{m.turbosmtp_back_to_email()}
		</Button>
	{/snippet}
</AdminPageHeader>

<div
	class={[
		'rounded-lg border p-4 shadow-sm',
		hero.tone === 'success' && 'border-success/40 bg-success/10',
		hero.tone === 'warning' && 'border-warning/40 bg-warning/10',
		hero.tone === 'info' && 'border-primary/40 bg-primary/5',
		hero.tone === 'neutral' && 'border-border bg-muted/40',
	]
		.filter(Boolean)
		.join(' ')}
>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex items-start gap-3">
			<div class="mt-0.5">
				{#if hero.tone === 'success'}
					<Check class="h-5 w-5 text-success" />
				{:else if hero.tone === 'warning'}
					<AlertCircle class="h-5 w-5 text-warning" />
				{:else}
					<Zap class="h-5 w-5 text-primary" />
				{/if}
			</div>
			<div class="space-y-1">
				<div class="text-sm font-semibold">{hero.title}</div>
				<p class="text-xs text-muted-foreground max-w-xl">{hero.body}</p>
			</div>
		</div>
		{#if hero.actionLabel || hero.secondaryLabel}
			<div class="flex flex-wrap gap-2 shrink-0">
				{#if hero.secondaryLabel}
					<Button size="sm" variant="ghost" onclick={hero.secondary} disabled={busy}>
						{hero.secondaryLabel}
					</Button>
				{/if}
				{#if hero.actionLabel}
					<Button size="sm" onclick={hero.action} disabled={busy}>
						{hero.actionLabel}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<div class="flex flex-wrap items-center gap-2">
	{#if isConfigured}
		<span class="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs text-success-foreground">
			<Check class="h-3 w-3" /> {m.turbosmtp_status_configured()}
		</span>
	{:else if isPartial}
		<span class="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning-foreground">
			<AlertCircle class="h-3 w-3" /> {m.turbosmtp_partial_configured()}
		</span>
	{:else}
		<span class="inline-flex items-center gap-1 rounded-md border border-muted-foreground/40 bg-muted px-2 py-1 text-xs text-muted-foreground">
			{m.turbosmtp_not_configured()}
		</span>
	{/if}
	{#if isActive}
		<span class="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary">
			<Mail class="h-3 w-3" /> {m.turbosmtp_active_provider()}
		</span>
	{/if}
	{#if settings.turbo.region}
		<span class="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
			{m.turbosmtp_region_prefix({ region: settings.turbo.region.toUpperCase() })}
		</span>
	{/if}
</div>

{#if wizardActive}
	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				<Zap class="h-4 w-4" /> {m.turbosmtp_wizard_step_label({ step: wizardStep })}
			</CardTitle>
			<CardDescription>
				{#if wizardStep === 1}
					{m.turbosmtp_wizard_step1_subtitle()}
				{:else if wizardStep === 2}
					{#if wizardMethod === 'bootstrap'}
						{m.turbosmtp_bootstrap_card_subtitle()}
					{:else}
						{m.turbosmtp_manual_method_subtitle()}
					{/if}
				{:else}
					{m.turbosmtp_wizard_step3_subtitle()}
				{/if}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if wizardStep === 1}
				<div class="grid gap-3 sm:grid-cols-2">
					<button
						type="button"
						onclick={() => {
							wizardMethod = 'bootstrap'
							wizardStep = 2
						}}
						class={[
							'rounded-md border px-4 py-3 text-left transition-colors',
							wizardMethod === 'bootstrap' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30',
						].join(' ')}
					>
						<div class="font-medium text-sm">{m.turbosmtp_bootstrap_method_title()}</div>
						<div class="text-xs text-muted-foreground mt-1">
							{m.turbosmtp_bootstrap_method_subtitle()}
						</div>
					</button>
					<button
						type="button"
						onclick={() => {
							wizardMethod = 'manual'
							wizardStep = 2
						}}
						class={[
							'rounded-md border px-4 py-3 text-left transition-colors',
							wizardMethod === 'manual' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30',
						].join(' ')}
					>
						<div class="font-medium text-sm">{m.turbosmtp_manual_method_title()}</div>
						<div class="text-xs text-muted-foreground mt-1">
							{m.turbosmtp_manual_method_subtitle()}
						</div>
					</button>
				</div>
				<div class="flex justify-end">
					<Button size="sm" variant="ghost" onclick={() => (wizardDismissed = true)}>{m.turbosmtp_skip_wizard()}</Button>
				</div>
			{:else if wizardStep === 2 && wizardMethod === 'bootstrap'}
				<div class="grid gap-3 max-w-md">
					<div class="grid gap-2">
						<Label for="wb-email">{m.turbosmtp_bootstrap_email_label()}</Label>
						<Input id="wb-email" type="email" bind:value={wizardBootstrap.email} autocomplete="email" />
					</div>
					<div class="grid gap-2">
						<Label for="wb-pw">{m.turbosmtp_bootstrap_password_label()}</Label>
						<Input
							id="wb-pw"
							type="password"
							bind:value={wizardBootstrap.password}
							autocomplete="current-password"
						/>
					</div>
					<div class="grid gap-2">
						<Label for="wb-region">{m.turbosmtp_region_label()}</Label>
						<Select id="wb-region" bind:value={region}>
							<option value="global">{m.turbosmtp_region_global()}</option>
							<option value="eu">{m.turbosmtp_region_eu()}</option>
						</Select>
					</div>
				</div>
				<div class="flex flex-wrap gap-2 justify-end">
					<Button size="sm" variant="ghost" onclick={() => (wizardStep = 1)}>{m.turbosmtp_step_back()}</Button>
					<Button size="sm" variant="ghost" onclick={() => (wizardDismissed = true)}>{m.turbosmtp_skip_wizard()}</Button>
					<Button size="sm" onclick={runBootstrap} disabled={busy}>
						<Save class="h-3.5 w-3.5" />
						{m.turbosmtp_bootstrap_run()}
					</Button>
				</div>
			{:else if wizardStep === 2 && wizardMethod === 'manual'}
				<p class="text-sm text-muted-foreground">
					{m.turbosmtp_manual_step_subtitle()}
				</p>
				<div class="flex flex-wrap gap-2 justify-end">
					<Button size="sm" variant="ghost" onclick={() => (wizardStep = 1)}>{m.turbosmtp_step_back()}</Button>
					<Button size="sm" variant="ghost" onclick={() => (wizardDismissed = true)}>{m.turbosmtp_skip_wizard()}</Button>
					<Button size="sm" onclick={() => (wizardStep = 3)} disabled={!settings.turbo.apiKeySet}>
						{m.turbosmtp_manual_saved_continue()}
					</Button>
				</div>
			{:else if wizardStep === 3}
				<div class="grid gap-2 max-w-md">
					<Label for="wt-to">{m.turbosmtp_test_send_label()}</Label>
					<Input id="wt-to" type="email" bind:value={wizardTestTo} placeholder="you@example.com" />
				</div>
				<div class="flex flex-wrap gap-2 justify-end">
					<Button size="sm" variant="ghost" onclick={() => (wizardStep = 2)}>{m.turbosmtp_step_back()}</Button>
					<Button size="sm" variant="ghost" onclick={() => (wizardDismissed = true)}>{m.turbosmtp_skip_test_later()}</Button>
					<Button size="sm" onclick={sendWizardTest} disabled={busy || !wizardTestTo}>
						<Mail class="h-3.5 w-3.5" />
						{m.turbosmtp_test_send_mail()}
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
{/if}

{#if isConfigured}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.turbosmtp_card_stats_title()}</CardTitle>
			<CardDescription>{m.turbosmtp_card_stats_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if data.statsError}
				<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
					{m.turbosmtp_stats_unavailable({ reason: data.statsError })}
				</div>
			{:else if !data.stats}
				<p class="text-sm text-muted-foreground">{m.turbosmtp_stats_loading()}</p>
			{:else}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{@render Stat(m.turbosmtp_stat_sent(), data.stats.totalSent)}
					{@render Stat(m.turbosmtp_stat_delivered(), data.stats.delivered)}
					{@render Stat(m.turbosmtp_stat_failed(), data.stats.failed, 'danger')}
					{@render Stat(m.turbosmtp_stat_delivery_rate(), fmtPct(data.stats.deliveryRate), 'accent')}
				</div>
				{#if data.stats.totalSent > 0}
					<div style:height="180px">
						<BarChart
							data={hourlyChartData}
							x="hour"
							y="sent"
							bandPadding={0.2}
						/>
					</div>
				{:else}
					<p class="text-xs text-muted-foreground italic">{m.turbosmtp_no_sends_yet()}</p>
				{/if}
			{/if}
		</CardContent>
	</Card>

	<div class="grid gap-4 sm:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle class="text-base flex items-center gap-2">
					<ShieldOff class="h-4 w-4" /> {m.turbosmtp_card_suppression_title()}
				</CardTitle>
				<CardDescription>{m.turbosmtp_card_suppression_subtitle()}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				<div class="text-3xl font-semibold tabular-nums">
					{suppressionCount === null ? '—' : suppressionCount}
				</div>
				<div class="flex flex-wrap gap-2">
					<Button size="sm" variant="outline" onclick={syncSuppression} disabled={syncing}>
						<RefreshCw class={['h-3.5 w-3.5', syncing ? 'animate-spin' : ''].join(' ')} />
						{m.turbosmtp_suppression_sync_now()}
					</Button>
					<Button size="sm" variant="ghost" href="/admin/email/suppression">{m.turbosmtp_suppression_view_list()}</Button>
				</div>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">{m.turbosmtp_card_engagement_title()}</CardTitle>
				<CardDescription>{m.turbosmtp_card_engagement_subtitle()}</CardDescription>
			</CardHeader>
			<CardContent>
				{#if !data.stats}
					<p class="text-sm text-muted-foreground">{m.turbosmtp_stats_loading()}</p>
				{:else}
					<div class="grid grid-cols-3 gap-3">
						{@render Stat(m.turbosmtp_stat_opened(), data.stats.opened)}
						{@render Stat(m.turbosmtp_stat_clicked(), data.stats.clicked, 'accent')}
						{@render Stat(m.turbosmtp_stat_unsubs(), data.stats.unsubscribed, 'danger')}
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>
{/if}

<Card id="turbosmtp-creds-card">
	<CardHeader>
		<CardTitle class="text-base">{m.turbosmtp_card_credentials_title()}</CardTitle>
		<CardDescription>
			{m.turbosmtp_card_credentials_subtitle()}
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4 max-w-xl">
		<div class="grid gap-2">
			<Label for="tb-api">{m.turbosmtp_key_api_label()}</Label>
			<div class="flex gap-2">
				<Input
					id="tb-api"
					type={revealApiKey ? 'text' : 'password'}
					bind:value={apiKey}
					placeholder={settings.turbo.apiKeySet ? '••• stored — enter to replace' : ''}
					autocomplete="off"
				/>
				<Button
					size="icon"
					variant="ghost"
					onclick={() => (revealApiKey = !revealApiKey)}
					aria-label={revealApiKey ? m.turbosmtp_hide_api_key() : m.turbosmtp_reveal_api_key()}
				>
					{#if revealApiKey}
						<EyeOff class="h-4 w-4" />
					{:else}
						<Eye class="h-4 w-4" />
					{/if}
				</Button>
			</div>
			{#if settings.turbo.apiKeySet}
				<p class="text-xs text-success inline-flex items-center gap-1">
					<Check class="h-3 w-3" /> {m.turbosmtp_field_stored_keep_blank()}
				</p>
			{/if}
		</div>

		<div class="grid gap-2">
			<Label for="tb-ck">{m.turbosmtp_consumer_key_label()}</Label>
			<Input id="tb-ck" bind:value={consumerKey} oninput={onConsumerKeyInput} autocomplete="off" />
			{#if consumerKeyError}
				<p class="text-xs text-warning inline-flex items-center gap-1">
					<AlertCircle class="h-3 w-3" /> {consumerKeyError}
				</p>
			{/if}
		</div>

		<div class="grid gap-2">
			<Label for="tb-cs">{m.turbosmtp_consumer_secret_label()}</Label>
			<div class="flex gap-2">
				<Input
					id="tb-cs"
					type={revealConsumerSecret ? 'text' : 'password'}
					bind:value={consumerSecret}
					placeholder={settings.turbo.consumerSecretSet ? '••• stored — enter to replace' : ''}
					autocomplete="off"
				/>
				<Button
					size="icon"
					variant="ghost"
					onclick={() => (revealConsumerSecret = !revealConsumerSecret)}
					aria-label={revealConsumerSecret ? m.turbosmtp_hide_consumer_secret() : m.turbosmtp_reveal_consumer_secret()}
				>
					{#if revealConsumerSecret}
						<EyeOff class="h-4 w-4" />
					{:else}
						<Eye class="h-4 w-4" />
					{/if}
				</Button>
			</div>
			{#if settings.turbo.consumerSecretSet}
				<p class="text-xs text-success inline-flex items-center gap-1">
					<Check class="h-3 w-3" /> {m.turbosmtp_field_stored_keep_blank()}
				</p>
			{/if}
		</div>

		<div class="grid gap-2">
			<Label for="tb-region">{m.turbosmtp_region_label()}</Label>
			<Select id="tb-region" bind:value={region}>
				<option value="global">{m.turbosmtp_region_global()}</option>
				<option value="eu">{m.turbosmtp_region_eu()}</option>
			</Select>
		</div>

		{#if lastTest}
			<div
				class={[
					'rounded-md border px-3 py-2 text-xs',
					lastTest.ok
						? 'border-success/40 bg-success/10 text-success-foreground'
						: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
				].join(' ')}
			>
				{#if lastTest.ok}
					{m.turbosmtp_connection_ok_at({ at: new Date(lastTest.at).toLocaleTimeString() })}
				{:else}
					{m.turbosmtp_test_failed_prefix({ reason: lastTest.reason ?? 'unknown' })}
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap gap-2 justify-end">
			<Button size="sm" variant="outline" onclick={testConnection} disabled={busy || !settings.turbo.apiKeySet}>
				<Zap class="h-3.5 w-3.5" />
				{m.turbosmtp_test_connection()}
			</Button>
			<Button size="sm" onclick={saveCredentials} disabled={busy}>
				<Save class="h-3.5 w-3.5" />
				{m.turbosmtp_save()}
			</Button>
		</div>
	</CardContent>
</Card>

{#if isConfigured}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.turbosmtp_card_consumer_keys_title()}</CardTitle>
			<CardDescription>{m.turbosmtp_card_consumer_keys_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-2">
			{#if data.consumerKeysError}
				<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
					{m.turbosmtp_suppression_unavailable({ reason: data.consumerKeysError })}
				</div>
			{:else if !data.consumerKeys}
				<p class="text-sm text-muted-foreground">{m.turbosmtp_consumer_keys_loading()}</p>
			{:else if data.consumerKeys.length === 0}
				<p class="text-sm text-muted-foreground">{m.turbosmtp_consumer_keys_empty()}</p>
			{:else}
				<ul class="divide-y divide-border text-sm">
					{#each data.consumerKeys as k (k.consumerKey)}
						<li class="flex items-center justify-between py-2">
							<div>
								<div class="font-mono text-xs">{k.consumerKey}</div>
								{#if k.label}
									<div class="text-xs text-muted-foreground">{k.label}</div>
								{/if}
							</div>
							{#if k.creationTime}
								<div class="text-xs text-muted-foreground">{k.creationTime}</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</CardContent>
	</Card>
{/if}

{#snippet Stat(label: string, value: string | number, tone?: 'accent' | 'danger')}
	<div
		class={[
			'rounded-md border px-3 py-2',
			tone === 'danger' ? 'border-destructive/40 bg-destructive/5' : '',
			tone === 'accent' ? 'border-primary/40 bg-primary/5' : '',
			!tone ? 'border-border bg-muted/40' : '',
		].join(' ')}
	>
		<div class="text-xs text-muted-foreground">{label}</div>
		<div class="text-lg font-semibold">{value}</div>
	</div>
{/snippet}
