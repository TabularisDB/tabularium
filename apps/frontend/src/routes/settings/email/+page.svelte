<script lang="ts">
	import { onMount } from 'svelte'
	import { goto, invalidateAll } from '$app/navigation'
	import Card from '$components/ui/Card.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import { auth } from '$lib/stores/auth.svelte'
	import { toast } from 'svelte-sonner'
	import type { EmailBucket, EmailSettingsData } from './+page.js'

	type Props = { data: EmailSettingsData }
	let { data }: Props = $props()

	let email = $state('')
	let locale = $state('en')
	let prefs = $state<Record<string, EmailBucket>>({})
	let busy = $state(false)

	$effect(() => {
		email = data.profile.email ?? ''
		locale = data.profile.locale
		prefs = { ...data.prefs }
	})

	onMount(async () => {
		await auth.refresh()
		if (!auth.user) {
			goto('/login?returnTo=/settings/email')
		}
	})

	const CATEGORIES = [
		{
			key: 'account',
			label: 'Account & security',
			description: 'Sign-up confirmation, password resets, security alerts.',
			optIn: false,
		},
		{
			key: 'owner_ops',
			label: 'Plugin moderation',
			description: 'When your plugin is approved or needs changes.',
			optIn: true,
		},
		{
			key: 'plugin_updates',
			label: 'Plugin updates you watch',
			description: 'New releases for plugins you subscribed to.',
			optIn: true,
		},
		{
			key: 'newsletter',
			label: 'Tabularium newsletter',
			description: 'Occasional product news, opt-in only.',
			optIn: true,
		},
	] as const

	async function saveProfile() {
		busy = true
		try {
			const next = email.trim().length === 0 ? null : email.trim()
			const res = await fetch('/api/users/me/email-profile', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: next, locale }),
			})
			if (res.status === 409) {
				toast.error('That email address is already in use.')
				return
			}
			if (!res.ok) {
				toast.error(`Save failed: ${await res.text()}`)
				return
			}
			toast.success('Email profile updated.')
			await invalidateAll()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed.')
		} finally {
			busy = false
		}
	}

	async function savePrefs() {
		busy = true
		try {
			const res = await fetch('/api/users/me/email-preferences', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ prefs }),
			})
			if (!res.ok) {
				toast.error(`Save failed: ${await res.text()}`)
				return
			}
			toast.success('Preferences updated.')
			await invalidateAll()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed.')
		} finally {
			busy = false
		}
	}

	function unsubscribeAll() {
		const next = { ...prefs }
		for (const c of CATEGORIES) if (c.optIn) next[c.key] = 'off'
		prefs = next
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-12 space-y-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">Email & notifications</h1>
		<p class="text-muted-foreground">Your address, locale, and what we send you.</p>
	</header>

	{#if !data.profile.email}
		<div
			class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
			role="status"
		>
			Your account has no email address. Add one to receive notifications.
		</div>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Email address & locale</CardTitle>
			<CardDescription>Used for every notification we send to you.</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-4 md:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="email">Email</Label>
					<Input id="email" type="email" bind:value={email} placeholder="you@example.com" disabled={busy} />
				</div>
				<div class="space-y-1.5">
					<Label for="locale">Locale</Label>
					<Select id="locale" bind:value={locale} disabled={busy}>
						<option value="en">English</option>
						<option value="de">Deutsch</option>
						<option value="es">Español</option>
						<option value="fr">Français</option>
						<option value="it">Italiano</option>
						<option value="zh-CN">中文 (简体)</option>
					</Select>
				</div>
			</div>
			<div class="flex justify-end">
				<Button onclick={saveProfile} disabled={busy}>Save email & locale</Button>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Preferences</CardTitle>
			<CardDescription>
				Choose how often you'd like to receive each kind of email. Account messages can't be turned off.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			{#each CATEGORIES as cat (cat.key)}
				<div
					class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3"
				>
					<div class="space-y-0.5 min-w-0 flex-1 pr-2">
						<Label for={`cat-${cat.key}`} class="text-sm font-medium">
							{cat.label}
						</Label>
						<p class="text-xs text-muted-foreground">{cat.description}</p>
					</div>
					{#if cat.optIn}
						<Select
							id={`cat-${cat.key}`}
							bind:value={prefs[cat.key]}
							disabled={busy}
							class="h-9 w-auto min-w-[10rem]"
						>
							<option value="instant">Instant</option>
							<option value="daily">Daily digest</option>
							<option value="weekly">Weekly digest</option>
							<option value="off">Off</option>
						</Select>
					{:else}
						<span class="text-xs italic text-muted-foreground whitespace-nowrap">Always on</span>
					{/if}
				</div>
			{/each}
			<div class="flex flex-wrap items-center gap-3 pt-2">
				<Button onclick={savePrefs} disabled={busy}>Save preferences</Button>
				<Button variant="outline" onclick={unsubscribeAll} disabled={busy}>
					Unsubscribe from everything
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
