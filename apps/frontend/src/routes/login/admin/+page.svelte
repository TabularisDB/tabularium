<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import KeyRound from '@lucide/svelte/icons/key-round'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import { api } from '$lib/api'
	import { auth } from '$lib/stores/auth.svelte'
	import type { InitStatus } from '$lib/types'

	let checking = $state(true)
	let recoveryAvailable = $state(false)
	let email = $state('')
	let password = $state('')
	let submitting = $state(false)
	let formError = $state<string | null>(null)

	onMount(async () => {
		try {
			const status = await api.get<InitStatus>('/api/init/status')
			if (status.requiresInit) {
				goto('/init')
				return
			}
			recoveryAvailable = status.emailRecoveryAvailable
		} finally {
			checking = false
		}
	})

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		formError = null
		submitting = true
		try {
			await api.post('/auth/email/login', { email, password })
			await auth.refresh()
			await goto('/admin')
		} catch (e) {
			formError = e instanceof Error ? e.message : 'Login failed'
			submitting = false
		}
	}
</script>

<div class="mx-auto max-w-md px-6 py-16 space-y-8">
	{#if checking}
		<p class="text-center text-sm text-muted-foreground">Checking…</p>
	{:else if !recoveryAvailable}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Recovery sign-in is closed</CardTitle>
				<CardDescription>
					The bootstrap admin has linked an OAuth account, so email + password recovery is no longer accepted. Sign in via
					your OAuth provider on the main login page.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button href="/login" class="w-full">Back to sign-in</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="text-center space-y-3">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
				<KeyRound class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">Bootstrap recovery</h1>
			<p class="text-sm text-muted-foreground">
				Only the initial admin account can sign in here, and only until they link any OAuth identity. Once linked, this
				path closes permanently and the admin uses OAuth like everyone else.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Admin recovery sign-in</CardTitle>
				<CardDescription>Email + password set during first-time setup.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={submit} class="space-y-4">
					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input id="email" type="email" bind:value={email} autocomplete="email" required disabled={submitting} />
					</div>
					<div class="space-y-2">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							bind:value={password}
							autocomplete="current-password"
							required
							disabled={submitting}
						/>
					</div>
					{#if formError}
						<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
							{formError}
						</div>
					{/if}
					<Button type="submit" disabled={submitting} class="w-full">
						{submitting ? 'Signing in…' : 'Sign in'}
					</Button>
				</form>
			</CardContent>
		</Card>

		<p class="text-center text-xs text-muted-foreground">
			Want to disable this? Link an OAuth account from <a href="/settings" class="text-primary hover:underline">settings</a>
			after signing in.
		</p>
	{/if}
</div>
