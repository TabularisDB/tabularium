<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import LogIn from '@lucide/svelte/icons/log-in'
	import Database from '@lucide/svelte/icons/database'
	import Check from '@lucide/svelte/icons/check'
	import X from '@lucide/svelte/icons/x'
	import Plug from '@lucide/svelte/icons/plug'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import type { InitStatus, InitDefaults } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	type Phase = 'checking' | 'login' | 'wizard' | 'submitting' | 'waiting' | 'done'
	type Dialect = 'pg' | 'mysql' | 'sqlite'

	let phase = $state<Phase>('checking')
	let formError = $state<string | null>(null)

	let bootEmail = $state('admin@example.com')
	let bootPassword = $state('')

	let dialect = $state<Dialect>('pg')
	let useUrlInput = $state(false)
	let rawUrl = $state('')

	let host = $state('localhost')
	let port = $state<string>('5432')
	let dbName = $state('registry')
	let dbUser = $state('registry')
	let dbPass = $state('')
	let useSsl = $state(false)
	let sqlitePath = $state('./data/registry.sqlite')

	let probeState = $state<'idle' | 'probing' | 'ok' | 'failed'>('idle')
	let probeError = $state<string | null>(null)

	const computedUrl = $derived.by(() => {
		if (useUrlInput) return rawUrl.trim()
		if (dialect === 'sqlite') return `sqlite:${sqlitePath.trim()}`
		const scheme = dialect === 'pg' ? 'postgres' : 'mysql'
		const auth = dbUser ? `${encodeURIComponent(dbUser)}${dbPass ? `:${encodeURIComponent(dbPass)}` : ''}@` : ''
		const portPart = port ? `:${port}` : ''
		const sslPart = useSsl ? (dialect === 'pg' ? '?sslmode=require' : '?ssl=true') : ''
		return `${scheme}://${auth}${host.trim()}${portPart}/${encodeURIComponent(dbName.trim())}${sslPart}`
	})

	$effect(() => {
		void computedUrl
		probeState = 'idle'
		probeError = null
	})

	$effect(() => {
		if (dialect === 'pg' && port === '3306') port = '5432'
		if (dialect === 'mysql' && port === '5432') port = '3306'
	})

	onMount(async () => {
		try {
			const { data, error } = await eden.api.init.status.get()
			if (error) throw error
			const status = data as InitStatus
			if (!status.requiresInit) {
				goto('/login')
				return
			}
			phase = 'login'
		} catch {
			phase = 'login'
		}
	})

	async function submitBootstrapLogin(e: SubmitEvent) {
		e.preventDefault()
		formError = null
		try {
			const loginRes = await eden.api.init.login.post({ email: bootEmail, password: bootPassword })
			if (loginRes.error)
				throw new Error(
					typeof loginRes.error.value === 'string'
						? loginRes.error.value
						: ((loginRes.error.value as { error?: string })?.error ?? `Request failed (${loginRes.error.status})`),
				)
			const defaultsRes = await eden.api.init.defaults.get()
			if (defaultsRes.error)
				throw new Error(
					typeof defaultsRes.error.value === 'string'
						? defaultsRes.error.value
						: ((defaultsRes.error.value as { error?: string })?.error ??
								`Request failed (${defaultsRes.error.status})`),
				)
			const defaults = defaultsRes.data as InitDefaults
			seedFromDefaults(defaults.database.url)
			phase = 'wizard'
		} catch (e) {
			formError = e instanceof Error ? e.message : m.init_login_failed()
		}
	}

	function seedFromDefaults(url: string) {
		if (!url) return
		rawUrl = url
		if (/^sqlite:/i.test(url) || (!/^postgres(ql)?:\/\//i.test(url) && !/^mysql:\/\//i.test(url))) {
			dialect = 'sqlite'
			sqlitePath = url.replace(/^sqlite:(\/\/)?/, '') || './data/registry.sqlite'
			return
		}
		try {
			const u = new URL(url.replace(/^postgresql:/, 'postgres:'))
			dialect = u.protocol.startsWith('mysql') ? 'mysql' : 'pg'
			host = u.hostname || 'localhost'
			port = u.port || (dialect === 'pg' ? '5432' : '3306')
			dbUser = decodeURIComponent(u.username || '')
			dbPass = decodeURIComponent(u.password || '')
			dbName = decodeURIComponent(u.pathname.replace(/^\//, '')) || 'registry'
			const sslmode = u.searchParams.get('sslmode')
			const ssl = u.searchParams.get('ssl')
			useSsl =
				sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full' || ssl === 'true' || ssl === '1'
		} catch {
			useUrlInput = true
		}
	}

	async function testConnection() {
		probeState = 'probing'
		probeError = null
		try {
			const { data, error } = await eden.api.init['test-db'].post({ url: computedUrl })
			if (error) {
				probeState = 'failed'
				probeError =
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `HTTP ${error.status}`)
				return
			}
			const result = data as { ok: boolean; dialect: string; error?: string }
			if (result.ok) {
				probeState = 'ok'
			} else {
				probeState = 'failed'
				probeError = result.error ?? m.init_test_db_failed()
			}
		} catch (e) {
			probeState = 'failed'
			probeError = e instanceof Error ? e.message : m.init_test_db_failed()
		}
	}

	async function submitWizard(e: SubmitEvent) {
		e.preventDefault()
		formError = null
		phase = 'submitting'
		const { error } = await eden.api.init.complete.post({ database: { url: computedUrl } })
		if (error) {
			const v = error.value as { error?: string; detail?: string } | string | null
			formError =
				typeof v === 'object' && v?.detail ? v.detail : typeof v === 'string' ? v : (v?.error ?? m.init_setup_failed())
			phase = 'wizard'
			return
		}
		phase = 'waiting'
		void waitForRestart()
	}

	async function waitForRestart() {
		const TIMEOUT_MS = 30_000
		const INTERVAL_MS = 500
		const start = Date.now()
		while (Date.now() - start < TIMEOUT_MS) {
			try {
				const res = await fetch('/api/init/status', { cache: 'no-store' })
				if (res.ok) {
					const status = (await res.json()) as { setupCompleted: boolean; mode?: 'setup' | 'normal' }
					if (status.setupCompleted && status.mode === 'normal') {
						await auth.refresh()
						goto('/admin')
						return
					}
				}
			} catch {
				// expected during the restart gap; keep polling
			}
			await new Promise((r) => setTimeout(r, INTERVAL_MS))
		}
		phase = 'done'
	}
</script>

<div class="mx-auto max-w-md px-6 py-16 space-y-8">
	{#if phase === 'checking'}
		<p class="text-center text-sm text-muted-foreground">{m.init_checking()}</p>
	{:else if phase === 'login'}
		<div class="text-center space-y-3">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
				<LogIn class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">{m.init_login_title()}</h1>
			<p class="text-sm text-muted-foreground">{m.init_login_subtitle()}</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">{m.init_bootstrap_card_title()}</CardTitle>
				<CardDescription>{m.init_bootstrap_card_subtitle()}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={submitBootstrapLogin} class="space-y-4">
					<div class="space-y-2">
						<Label for="bootEmail">{m.init_email()}</Label>
						<Input id="bootEmail" type="email" bind:value={bootEmail} required />
					</div>
					<div class="space-y-2">
						<Label for="bootPassword">{m.init_password()}</Label>
						<Input id="bootPassword" type="password" bind:value={bootPassword} autocomplete="off" required />
					</div>
					{#if formError}
						<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
							{formError}
						</div>
					{/if}
					<Button type="submit" class="w-full">{m.init_continue()}</Button>
				</form>
			</CardContent>
		</Card>
	{:else if phase === 'wizard' || phase === 'submitting'}
		<div class="text-center space-y-3">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
				<ShieldCheck class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">{m.init_wizard_title()}</h1>
			<p class="text-sm text-muted-foreground">
				{m.init_wizard_subtitle()}
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle class="text-base flex items-center gap-2"><Database class="h-4 w-4" />{m.init_database()}</CardTitle>
				<CardDescription>{m.init_database_subtitle()}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={submitWizard} class="space-y-4">
					<div class="space-y-2">
						<Label for="dbDialect">{m.init_db_type()}</Label>
						<Select id="dbDialect" bind:value={dialect} disabled={phase === 'submitting' || useUrlInput}>
							<option value="pg">PostgreSQL</option>
							<option value="mysql">MySQL</option>
							<option value="sqlite">SQLite</option>
						</Select>
					</div>

					{#if !useUrlInput}
						{#if dialect === 'sqlite'}
							<div class="space-y-2">
								<Label for="sqlitePath">{m.init_db_file_path()}</Label>
								<Input
									id="sqlitePath"
									bind:value={sqlitePath}
									placeholder="./data/registry.sqlite"
									required
									disabled={phase === 'submitting'}
								/>
							</div>
						{:else}
							<div class="grid grid-cols-3 gap-2">
								<div class="col-span-2 space-y-2">
									<Label for="dbHost">{m.init_db_host()}</Label>
									<Input
										id="dbHost"
										bind:value={host}
										placeholder="localhost"
										required
										disabled={phase === 'submitting'}
									/>
								</div>
								<div class="space-y-2">
									<Label for="dbPort">{m.init_db_port()}</Label>
									<Input id="dbPort" type="number" bind:value={port} required disabled={phase === 'submitting'} />
								</div>
							</div>
							<div class="space-y-2">
								<Label for="dbName">{m.init_db_name()}</Label>
								<Input
									id="dbName"
									bind:value={dbName}
									placeholder="registry"
									required
									disabled={phase === 'submitting'}
								/>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div class="space-y-2">
									<Label for="dbUser">{m.init_db_user()}</Label>
									<Input
										id="dbUser"
										bind:value={dbUser}
										placeholder="registry"
										required
										disabled={phase === 'submitting'}
									/>
								</div>
								<div class="space-y-2">
									<Label for="dbPass">{m.init_db_password()}</Label>
									<Input
										id="dbPass"
										type="password"
										bind:value={dbPass}
										autocomplete="off"
										disabled={phase === 'submitting'}
									/>
								</div>
							</div>
							<label class="flex items-start gap-3 cursor-pointer select-none pt-1">
								<input
									type="checkbox"
									bind:checked={useSsl}
									disabled={phase === 'submitting'}
									class="h-4 w-4 rounded border-input mt-0.5"
								/>
								<span class="space-y-0.5">
									<span class="block text-sm">{m.init_db_ssl()}</span>
									<span class="block text-xs text-muted-foreground">{m.init_db_ssl_hint()}</span>
								</span>
							</label>
						{/if}
					{:else}
						<div class="space-y-2">
							<Label for="rawUrl">{m.init_connection_url()}</Label>
							<Input
								id="rawUrl"
								bind:value={rawUrl}
								placeholder="postgres://user:pass@host:5432/db"
								required
								disabled={phase === 'submitting'}
							/>
						</div>
					{/if}

					<div class="flex items-center justify-between text-xs text-muted-foreground">
						<button
							type="button"
							class="text-primary hover:underline"
							onclick={() => (useUrlInput = !useUrlInput)}
							disabled={phase === 'submitting'}
						>
							{useUrlInput ? m.init_db_use_form() : m.init_db_use_url()}
						</button>
						<code class="font-mono text-[10px] opacity-70 truncate max-w-[60%]" title={computedUrl}>{computedUrl}</code>
					</div>

					<div class="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={testConnection}
							disabled={phase === 'submitting' || probeState === 'probing' || !computedUrl}
						>
							<Plug class="h-3.5 w-3.5" />
							{probeState === 'probing' ? m.init_db_testing() : m.init_db_test()}
						</Button>
						{#if probeState === 'ok'}
							<span class="inline-flex items-center gap-1 text-xs text-success"
								><Check class="h-3.5 w-3.5" />{m.init_db_test_ok()}</span
							>
						{:else if probeState === 'failed'}
							<span class="inline-flex items-center gap-1 text-xs text-destructive"
								><X class="h-3.5 w-3.5" />{m.init_db_test_failed()}</span
							>
						{/if}
					</div>

					{#if probeError}
						<div
							class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive break-all"
						>
							{probeError}
						</div>
					{/if}

					{#if formError}
						<div
							class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive break-all"
						>
							{formError}
						</div>
					{/if}

					<Button type="submit" disabled={phase === 'submitting'} class="w-full">
						{phase === 'submitting' ? m.init_setting_up() : m.init_complete_setup()}
					</Button>
				</form>
			</CardContent>
		</Card>
	{:else if phase === 'waiting'}
		<div class="text-center space-y-4">
			<div
				class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary animate-pulse"
			>
				<ShieldCheck class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">{m.init_waiting_title()}</h1>
			<p class="text-sm text-muted-foreground">{m.init_waiting_subtitle()}</p>
		</div>
	{:else if phase === 'done'}
		<div class="text-center space-y-4">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
				<ShieldCheck class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">{m.init_done_title()}</h1>
			<p class="text-sm text-muted-foreground">
				{m.init_done_body_prefix()} <a href="/login/admin" class="text-primary hover:underline">/login/admin</a>
				{m.init_done_body_middle()} <code class="text-foreground">admin@example.com</code>
				{m.init_done_body_suffix()}
			</p>
		</div>
	{/if}
</div>
