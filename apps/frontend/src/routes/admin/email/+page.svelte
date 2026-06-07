<script lang="ts">
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Send from '@lucide/svelte/icons/send'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Check from '@lucide/svelte/icons/check'
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
	import type { EmailSettings } from './+page.js'

	type Props = { data: { settings: EmailSettings } }
	let { data }: Props = $props()

	function initialState(d: { settings: EmailSettings }) {
		const init = d.settings
		return {
			s: init,
			provider: init.provider,
			bootstrapRegion: (init.turbo?.region ?? 'global') as 'global' | 'eu',
			turboKeys: {
				apiKey: '',
				consumerKey: init.turbo?.consumerKey ?? '',
				consumerSecret: '',
				region: (init.turbo?.region ?? 'global') as 'global' | 'eu',
			},
			smtp: {
				host: init.smtp?.host ?? '',
				port: String(init.smtp?.port ?? 587),
				user: init.smtp?.user ?? '',
				pass: '',
				tls: init.smtp?.tls ?? true,
			},
			fromDefault: init.from?.default ?? '',
			overridePairs: Object.entries(init.from?.overrides ?? {}).map(([key, value]) => ({
				key,
				value: String(value),
			})),
		}
	}

	// svelte-ignore state_referenced_locally
	const _init = initialState(data)
	let s = $state<EmailSettings>(_init.s)
	let provider = $state<'turbo' | 'smtp' | null>(_init.provider)
	let turboMode = $state<'bootstrap' | 'manual'>('bootstrap')

	let bootstrap = $state({
		email: '',
		password: '',
		region: _init.bootstrapRegion,
	})

	let turboKeys = $state(_init.turboKeys)
	let smtp = $state(_init.smtp)
	let fromDefault = $state(_init.fromDefault)
	let overridePairs = $state<{ key: string; value: string }[]>(_init.overridePairs)

	let testTo = $state('')
	let testResult = $state<{ kind: 'ok' | 'err'; text: string } | null>(null)
	let busy = $state(false)

	function buildOverrides(): Record<string, string> {
		const out: Record<string, string> = {}
		for (const { key, value } of overridePairs) {
			const k = key.trim()
			if (!k) continue
			out[k] = value
		}
		return out
	}

	function syncFromSettings(next: EmailSettings) {
		s = next
		provider = next.provider
		fromDefault = next.from?.default ?? ''
		overridePairs = Object.entries(next.from?.overrides ?? {}).map(([key, value]) => ({
			key,
			value: String(value),
		}))
		turboKeys.consumerKey = next.turbo?.consumerKey ?? ''
		turboKeys.region = next.turbo?.region ?? 'global'
		turboKeys.apiKey = ''
		turboKeys.consumerSecret = ''
		bootstrap.region = next.turbo?.region ?? 'global'
		bootstrap.password = ''
		smtp.host = next.smtp?.host ?? ''
		smtp.port = String(next.smtp?.port ?? 587)
		smtp.user = next.smtp?.user ?? ''
		smtp.tls = next.smtp?.tls ?? true
		smtp.pass = ''
	}

	async function refreshSettings() {
		const res = await fetch('/api/admin/email')
		if (res.ok) {
			const next = (await res.json()) as EmailSettings
			syncFromSettings(next)
		}
	}

	async function errMsg(res: Response): Promise<string> {
		try {
			const j = await res.json()
			if (j && typeof j === 'object' && 'error' in j && typeof j.error === 'string') return j.error
			return `Request failed (${res.status})`
		} catch {
			return `Request failed (${res.status})`
		}
	}

	type PutBody = {
		provider: 'turbo' | 'smtp' | null
		from: { default: string; overrides: Record<string, string> }
		turbo?: {
			apiKey?: string
			consumerKey?: string
			consumerSecret?: string
			region?: 'global' | 'eu'
		}
		smtp?: {
			host?: string
			port?: number
			user?: string
			pass?: string
			tls?: boolean
		}
	}

	async function putSettings(body: PutBody): Promise<boolean> {
		busy = true
		try {
			const res = await fetch('/api/admin/email', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				toast.error(await errMsg(res))
				return false
			}
			toast.success('Saved')
			await refreshSettings()
			return true
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed')
			return false
		} finally {
			busy = false
		}
	}

	async function savePassive() {
		await putSettings({
			provider,
			from: { default: fromDefault, overrides: buildOverrides() },
		})
	}

	async function saveTurboManual() {
		const turbo: PutBody['turbo'] = {
			region: turboKeys.region,
			consumerKey: turboKeys.consumerKey,
		}
		if (turboKeys.apiKey) turbo.apiKey = turboKeys.apiKey
		if (turboKeys.consumerSecret) turbo.consumerSecret = turboKeys.consumerSecret
		await putSettings({
			provider: 'turbo',
			from: { default: fromDefault, overrides: buildOverrides() },
			turbo,
		})
	}

	async function saveSmtp() {
		const portNum = Number(smtp.port)
		if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
			toast.error('Port must be between 1 and 65535')
			return
		}
		const smtpBody: PutBody['smtp'] = {
			host: smtp.host,
			port: portNum,
			user: smtp.user,
			tls: smtp.tls,
		}
		if (smtp.pass) smtpBody.pass = smtp.pass
		await putSettings({
			provider: 'smtp',
			from: { default: fromDefault, overrides: buildOverrides() },
			smtp: smtpBody,
		})
	}

	async function runBootstrap() {
		if (!bootstrap.email || !bootstrap.password) {
			toast.error('Email and password are required')
			return
		}
		busy = true
		try {
			const res = await fetch('/api/admin/email/bootstrap', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email: bootstrap.email,
					password: bootstrap.password,
					region: bootstrap.region,
				}),
			})
			if (!res.ok) {
				toast.error(await errMsg(res))
				return
			}
			const json = (await res.json()) as { ok: true; consumerKeyLabel: string; testMid: string }
			bootstrap.password = ''
			toast.success(`Bootstrapped (test mid: ${json.testMid})`)
			await refreshSettings()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Bootstrap failed')
		} finally {
			busy = false
		}
	}

	async function sendTest() {
		if (!testTo) {
			testResult = { kind: 'err', text: 'Recipient required' }
			return
		}
		busy = true
		testResult = null
		try {
			const res = await fetch('/api/admin/email/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ to: testTo, locale: 'en' }),
			})
			if (!res.ok) {
				testResult = { kind: 'err', text: await errMsg(res) }
				return
			}
			const json = (await res.json()) as { ok: true; logId: number; providerMid: string }
			testResult = { kind: 'ok', text: `Sent — provider mid: ${json.providerMid}` }
		} catch (e) {
			testResult = { kind: 'err', text: e instanceof Error ? e.message : 'Send failed' }
		} finally {
			busy = false
		}
	}

	function addOverride() {
		overridePairs = [...overridePairs, { key: '', value: '' }]
	}
	function removeOverride(i: number) {
		overridePairs = overridePairs.filter((_, idx) => idx !== i)
	}
</script>

<AdminPageHeader title="Email" subtitle="Configure how the registry sends notification emails.">
	{#snippet actions()}
		<Button variant="outline" size="sm" href="/admin/email/suppression">View suppression list →</Button>
	{/snippet}
</AdminPageHeader>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Provider</CardTitle>
		<CardDescription>
			Pick a transport for outgoing mail. When disabled, emails are silently dropped (queue-only stub).
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3">
		<div class="flex flex-wrap gap-2">
			{#each [{ v: null, label: 'Disabled' }, { v: 'turbo' as const, label: 'TurboSMTP' }, { v: 'smtp' as const, label: 'SMTP' }] as opt (String(opt.v))}
				<button
					type="button"
					onclick={() => (provider = opt.v)}
					class={[
						'rounded-md border px-3 py-1.5 text-sm transition-colors',
						provider === opt.v
							? 'border-primary text-foreground bg-primary/10'
							: 'border-border text-muted-foreground hover:bg-accent/50',
					].join(' ')}
				>
					{opt.label}
				</button>
			{/each}
		</div>
		{#if provider === null}
			<div class="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
				Disabled — emails are queued only and never delivered.
			</div>
		{/if}
	</CardContent>
</Card>

{#if provider !== null}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">From address</CardTitle>
			<CardDescription>Default sender and per-trigger overrides (e.g. <code>plugin.approved</code>).</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2 max-w-md">
				<Label for="from-default">Default from</Label>
				<Input
					id="from-default"
					type="email"
					bind:value={fromDefault}
					placeholder="Tabularium <no-reply@example.com>"
				/>
			</div>
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<Label>Overrides</Label>
					<Button size="sm" variant="ghost" onclick={addOverride}>
						<Plus class="h-3.5 w-3.5" /> Add override
					</Button>
				</div>
				{#if overridePairs.length === 0}
					<p class="text-xs text-muted-foreground">No overrides. The default address is used for every trigger.</p>
				{:else}
					<div class="space-y-2">
						{#each overridePairs as pair, i (i)}
							<div class="flex gap-2 items-start">
								<Input bind:value={pair.key} placeholder="plugin.approved" class="max-w-[14rem]" />
								<Input bind:value={pair.value} placeholder="approvals@example.com" />
								<Button size="icon" variant="ghost" onclick={() => removeOverride(i)} aria-label="Remove override">
									<Trash2 class="h-3.5 w-3.5" />
								</Button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex justify-end">
				<Button size="sm" variant="outline" onclick={savePassive} disabled={busy}>
					<Save class="h-3.5 w-3.5" />
					Save provider &amp; from
				</Button>
			</div>
		</CardContent>
	</Card>
{/if}

{#if provider === 'turbo'}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">TurboSMTP</CardTitle>
			<CardDescription>
				Bootstrap auto-creates a Consumer Key with your TurboSMTP account credentials. Manual keys are for advanced
				setups.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="flex gap-2 border-b border-border">
				<button
					type="button"
					onclick={() => (turboMode = 'bootstrap')}
					class={[
						'px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors',
						turboMode === 'bootstrap'
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground',
					].join(' ')}
				>
					Bootstrap
				</button>
				<button
					type="button"
					onclick={() => (turboMode = 'manual')}
					class={[
						'px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors',
						turboMode === 'manual'
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground',
					].join(' ')}
				>
					Manual keys
				</button>
			</div>

			{#if turboMode === 'bootstrap'}
				<div class="space-y-3 max-w-md">
					<div class="grid gap-2">
						<Label for="bs-email">TurboSMTP account email</Label>
						<Input id="bs-email" type="email" bind:value={bootstrap.email} autocomplete="email" />
					</div>
					<div class="grid gap-2">
						<Label for="bs-password">TurboSMTP account password</Label>
						<Input id="bs-password" type="password" bind:value={bootstrap.password} autocomplete="current-password" />
					</div>
					<div class="grid gap-2">
						<Label for="bs-region">Region</Label>
						<Select id="bs-region" bind:value={bootstrap.region}>
							<option value="global">Global</option>
							<option value="eu">EU</option>
						</Select>
					</div>
					<div class="flex justify-end">
						<Button size="sm" onclick={runBootstrap} disabled={busy}>
							<Save class="h-3.5 w-3.5" />
							Bootstrap TurboSMTP
						</Button>
					</div>
				</div>
			{:else}
				<div class="space-y-3 max-w-md">
					<div class="grid gap-2">
						<Label for="tb-api">API key</Label>
						<Input
							id="tb-api"
							type="password"
							bind:value={turboKeys.apiKey}
							placeholder={s.turbo.apiKeySet ? '••• stored — enter to replace' : ''}
						/>
						{#if s.turbo.apiKeySet}
							<p class="text-xs text-success inline-flex items-center gap-1">
								<Check class="h-3 w-3" /> Stored — leave blank to keep
							</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="tb-ck">Consumer key</Label>
						<Input id="tb-ck" bind:value={turboKeys.consumerKey} />
					</div>
					<div class="grid gap-2">
						<Label for="tb-cs">Consumer secret</Label>
						<Input
							id="tb-cs"
							type="password"
							bind:value={turboKeys.consumerSecret}
							placeholder={s.turbo.consumerSecretSet ? '••• stored — enter to replace' : ''}
						/>
						{#if s.turbo.consumerSecretSet}
							<p class="text-xs text-success inline-flex items-center gap-1">
								<Check class="h-3 w-3" /> Stored — leave blank to keep
							</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="tb-region">Region</Label>
						<Select id="tb-region" bind:value={turboKeys.region}>
							<option value="global">Global</option>
							<option value="eu">EU</option>
						</Select>
					</div>
					<div class="flex justify-end">
						<Button size="sm" onclick={saveTurboManual} disabled={busy}>
							<Save class="h-3.5 w-3.5" />
							Save TurboSMTP keys
						</Button>
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>
{/if}

{#if provider === 'smtp'}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">SMTP</CardTitle>
			<CardDescription>Plain SMTP fallback. Use TLS unless your provider requires STARTTLS-only.</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3 max-w-md">
			<div class="grid gap-2">
				<Label for="smtp-host">Host</Label>
				<Input id="smtp-host" bind:value={smtp.host} placeholder="smtp.example.com" />
			</div>
			<div class="grid gap-2">
				<Label for="smtp-port">Port</Label>
				<Input id="smtp-port" type="number" bind:value={smtp.port} min={1} max={65535} />
			</div>
			<div class="grid gap-2">
				<Label for="smtp-user">User</Label>
				<Input id="smtp-user" bind:value={smtp.user} autocomplete="username" />
			</div>
			<div class="grid gap-2">
				<Label for="smtp-pass">Password</Label>
				<Input
					id="smtp-pass"
					type="password"
					bind:value={smtp.pass}
					autocomplete="new-password"
					placeholder={s.smtp.passSet ? '••• stored — enter to replace' : ''}
				/>
				{#if s.smtp.passSet}
					<p class="text-xs text-success inline-flex items-center gap-1">
						<Check class="h-3 w-3" /> Stored — leave blank to keep
					</p>
				{/if}
			</div>
			<label class="flex items-center gap-3 cursor-pointer select-none">
				<input type="checkbox" bind:checked={smtp.tls} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">Use TLS</span>
			</label>
			<div class="flex justify-end">
				<Button size="sm" onclick={saveSmtp} disabled={busy}>
					<Save class="h-3.5 w-3.5" />
					Save SMTP
				</Button>
			</div>
		</CardContent>
	</Card>
{/if}

<Card>
	<CardHeader>
		<CardTitle class="text-base">Send test email</CardTitle>
		<CardDescription
			>Sends the account-welcome template to the address below using the current provider.</CardDescription
		>
	</CardHeader>
	<CardContent class="space-y-3 max-w-md">
		<div class="grid gap-2">
			<Label for="test-to">Recipient</Label>
			<div class="flex gap-2">
				<Input id="test-to" type="email" bind:value={testTo} placeholder="you@example.com" />
				<Button size="sm" onclick={sendTest} disabled={busy || !testTo}>
					<Send class="h-3.5 w-3.5" />
					Send test
				</Button>
			</div>
		</div>
		{#if testResult}
			<div
				class={[
					'rounded-md border px-3 py-2 text-xs',
					testResult.kind === 'ok'
						? 'border-success/40 bg-success/10 text-success-foreground'
						: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
				].join(' ')}
			>
				{testResult.text}
			</div>
		{/if}
	</CardContent>
</Card>
