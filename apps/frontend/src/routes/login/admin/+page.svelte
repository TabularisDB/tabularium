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
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import type { InitStatus } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	let checking = $state(true)
	let recoveryAvailable = $state(false)
	let email = $state('')
	let password = $state('')
	let submitting = $state(false)
	let formError = $state<string | null>(null)

	onMount(async () => {
		try {
			if (!auth.loaded) await auth.refresh()
			if (auth.user) {
				goto(auth.isAdmin ? '/admin' : '/')
				return
			}
			const { data, error } = await eden.api.init.status.get()
			if (error) throw error
			const status = data as InitStatus
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
			const { error } = await eden.auth.email.login.post({ email, password })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			await auth.refresh()
			await goto('/admin')
		} catch (e) {
			formError = e instanceof Error ? e.message : m.login_admin_login_failed()
			submitting = false
		}
	}
</script>

<div class="mx-auto max-w-md px-6 py-16 space-y-8">
	{#if checking}
		<p class="text-center text-sm text-muted-foreground">{m.login_admin_checking()}</p>
	{:else if !recoveryAvailable}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">{m.login_admin_closed_title()}</CardTitle>
				<CardDescription>
					{m.login_admin_closed_body()}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button href="/login" class="w-full">{m.login_admin_back_to_signin()}</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="text-center space-y-3">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
				<KeyRound class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">{m.login_admin_bootstrap_title()}</h1>
			<p class="text-sm text-muted-foreground">
				{m.login_admin_bootstrap_subtitle()}
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">{m.login_admin_card_title()}</CardTitle>
				<CardDescription>{m.login_admin_card_subtitle()}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={submit} class="space-y-4">
					<div class="space-y-2">
						<Label for="email">{m.login_admin_email()}</Label>
						<Input id="email" type="email" bind:value={email} autocomplete="email" required disabled={submitting} />
					</div>
					<div class="space-y-2">
						<Label for="password">{m.login_admin_password()}</Label>
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
						{submitting ? m.login_admin_signing_in() : m.login_admin_sign_in()}
					</Button>
				</form>
			</CardContent>
		</Card>

		<p class="text-center text-xs text-muted-foreground">
			{m.login_admin_disable_hint_prefix()} <a href="/settings" class="text-primary hover:underline">{m.login_admin_disable_hint_link()}</a>
			{m.login_admin_disable_hint_suffix()}
		</p>
	{/if}
</div>
