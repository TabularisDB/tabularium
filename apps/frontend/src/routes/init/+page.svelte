<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import LogIn from '@lucide/svelte/icons/log-in'
	import Database from '@lucide/svelte/icons/database'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import { eden } from '$lib/eden'
	import type { InitStatus, InitDefaults } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	type Phase = 'checking' | 'login' | 'wizard' | 'submitting' | 'waiting' | 'done'

	let phase = $state<Phase>('checking')
	let formError = $state<string | null>(null)

	let bootEmail = $state('admin@example.com')
	let bootPassword = $state('')
	let dbUrl = $state('')

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
			if (loginRes.error) throw new Error(typeof loginRes.error.value === 'string' ? loginRes.error.value : ((loginRes.error.value as { error?: string })?.error ?? `Request failed (${loginRes.error.status})`))
			const defaultsRes = await eden.api.init.defaults.get()
			if (defaultsRes.error) throw new Error(typeof defaultsRes.error.value === 'string' ? defaultsRes.error.value : ((defaultsRes.error.value as { error?: string })?.error ?? `Request failed (${defaultsRes.error.status})`))
			const defaults = defaultsRes.data as InitDefaults
			dbUrl = defaults.database.url
			phase = 'wizard'
		} catch (e) {
			formError = e instanceof Error ? e.message : m.init_login_failed()
		}
	}

	async function submitWizard(e: SubmitEvent) {
		e.preventDefault()
		formError = null
		phase = 'submitting'
		const { error } = await eden.api.init.complete.post({ database: { url: dbUrl } })
		if (error) {
			const v = error.value as { error?: string; detail?: string } | string | null
			formError = (typeof v === 'object' && v?.detail) ? v.detail : (typeof v === 'string' ? v : (v?.error ?? m.init_setup_failed()))
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
					const status = await res.json() as { setupCompleted: boolean }
					if (status.setupCompleted) {
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
						<Label for="dbUrl">{m.init_connection_url()}</Label>
						<Input
							id="dbUrl"
							bind:value={dbUrl}
							placeholder="postgres://user:pass@host:5432/db"
							required
							disabled={phase === 'submitting'}
						/>
					</div>
					{#if formError}
						<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive break-all">
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
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary animate-pulse">
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
				{m.init_done_body_prefix()} <a href="/login/admin" class="text-primary hover:underline">/login/admin</a> {m.init_done_body_middle()} <code class="text-foreground">admin@example.com</code> {m.init_done_body_suffix()}
			</p>
		</div>
	{/if}
</div>
