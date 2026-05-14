<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
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
	import { toast } from 'svelte-sonner'
	import type { AuthUser, InitStatus } from '$lib/types'

	let checking = $state(true)
	let allowed = $state(false)
	let email = $state('')
	let password = $state('')
	let confirmPassword = $state('')
	let displayName = $state('')
	let submitting = $state(false)
	let formError = $state<string | null>(null)

	const passwordsMismatch = $derived(
		confirmPassword.length > 0 && password !== confirmPassword,
	)

	onMount(async () => {
		try {
			const status = await api.get<InitStatus>('/api/init/status')
			if (status.hasAdmin) {
				goto('/login')
				return
			}
			allowed = true
		} finally {
			checking = false
		}
	})

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		formError = null
		if (password !== confirmPassword) {
			formError = 'Passwords do not match'
			return
		}
		submitting = true
		try {
			const result = await api.post<{ ok: true; user: AuthUser }>('/auth/email/register', {
				email,
				password,
				displayName,
			})
			auth.setUser(result.user)
			toast.success(`Welcome, ${result.user.displayName}`)
			await goto('/welcome')
		} catch (e) {
			formError = e instanceof Error ? e.message : 'Registration failed'
			submitting = false
		}
	}
</script>

<div class="mx-auto max-w-md px-6 py-16 space-y-8">
	{#if checking}
		<p class="text-center text-sm text-muted-foreground">Checking instance state…</p>
	{:else if allowed}
		<div class="text-center space-y-3">
			<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
				<ShieldCheck class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">First-time setup</h1>
			<p class="text-sm text-muted-foreground">
				Create the admin account for this Pluggr instance. You can wire OAuth providers and invite users from the admin
				panel after sign-in.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Admin account</CardTitle>
				<CardDescription>Email + password. Used only by the operator of this instance.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={submit} class="space-y-4">
					<div class="space-y-2">
						<Label for="displayName">Display name</Label>
						<Input id="displayName" bind:value={displayName} placeholder="Admin" required maxlength={60} disabled={submitting} />
					</div>
					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input id="email" type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" required disabled={submitting} />
					</div>
					<div class="space-y-2">
						<Label for="password">Password</Label>
						<Input id="password" type="password" bind:value={password} autocomplete="new-password" required minlength={8} disabled={submitting} />
						<p class="text-xs text-muted-foreground">Minimum 8 characters.</p>
					</div>
					<div class="space-y-2">
						<Label for="confirm">Confirm password</Label>
						<Input id="confirm" type="password" bind:value={confirmPassword} autocomplete="new-password" required disabled={submitting} />
						{#if passwordsMismatch}
							<p class="text-xs text-destructive">Passwords do not match.</p>
						{/if}
					</div>
					{#if formError}
						<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
							{formError}
						</div>
					{/if}
					<Button type="submit" disabled={submitting || passwordsMismatch} class="w-full">
						{submitting ? 'Setting up…' : 'Create admin & continue'}
					</Button>
				</form>
			</CardContent>
		</Card>
	{/if}
</div>
